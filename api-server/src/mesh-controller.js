const debounce = require('debounce');
const {LinuxNode} = require('./records/LinuxNode.js');

// Records that make us reload the mesh when changed
const meshRecordTypes = [
  'Allocation', // IP space
  'Node', 'LinuxNode', // Running servers
  'Tunnel', // Bridges between servers
  'Interface', 'WgInterface', 'ConNetInterface', // IP space assignments
];

// Records that are passed through to connected nodes
// They can handle these themselves without rebuilding the mesh
// If there's a `NodeId` field we filter by that
const nodeRecordTypes = [
  'AgentVersion', // inform of new agents so they can self-upgrade if enabled
  'PodInstance', // inform of what pods the node should be running
];

exports.MeshController = class MeshController {
  constructor(dustClient) {
    this.dustClient = dustClient;
    this.connectedNodes = new Map;

    this.knownNetworks = new Map;
    this.knownNodes = new Map;
    this.markMeshDirty = debounce(() => this.calculateMesh(), 1000);

    this.dustClient.recordCollection
      .filter(record => meshRecordTypes.includes(record.type))
      .onChange(this.markMeshDirty);
    /* ({prev,next}) => {
      if (prev === false) {
        // created
        console.log('introduced to node', next.id, next.SelfHostname);
      } else if (next === false) {
        // deleted
        console.log('node deleted:', prev.id, prev.SelfHostname);
      } else {
        // changed
        console.log('previus node data', prev.version);
        console.log('next node data', next.version, next.SelfHostname);
      }
    });
    */

    this.calculateMesh();
  }

  findNodeRelevantRecords(nodeId) {
    return this.dustClient.recordCollection
      .filter(record => record.NodeId === nodeId)
      .fetch();
  }

  calculateMesh() {
    const prevNodeIds = new Set(this.knownNodes.keys());
    console.log('Previously known nodes:', prevNodeIds);

    const linuxNodeRecords = this.dustClient.recordCollection
      .filter(record => record.type === 'LinuxNode');

    for (const nodeRecord of linuxNodeRecords.fetch()) {

      if (this.knownNodes.has(nodeRecord.id)) {
        prevNodeIds.delete(nodeRecord.id);
        const node = this.knownNodes.get(nodeRecord.id);
        node.applyConfig(nodeRecord);
      } else {
        console.log('introduced to new node', nodeRecord.id, nodeRecord.SelfHostname);
        const node = new LinuxNode(this);
        node.applyConfig(nodeRecord);
        this.knownNodes.set(nodeRecord.id, node);
      }
    }

    for (const prevNodeId of prevNodeIds) {
      console.log('Node', prevNodeId, 'disappeared!');
      const node = this.knownNodes.get(prevNodeId);
      this.knownNodes.delete(prevNodeId);
    }

    for (const node of this.knownNodes.values()) {
      //console.log('Linking node', node);
      node.link();
    }

    console.log('Calculated mesh of', Array.from(this.knownNodes.keys()).length, 'nodes');
  }

  async publishLinuxNode(client, nodeId) {
    const nodeRecord = this.dustClient
      .findRecord('LinuxNode', record =>
        record.id === nodeId);
    console.log('Connected node is', nodeRecord.id);
    client.sendMessage({ msg: 'added', collection: 'interfaces', id: 'CZevr7ikH6AGhvDc5', fields: {} });

    //this.connectedNodes.
  }

  async registerLinuxNode(client, metadata) {
    const record = this.dustClient
      .findRecord('LinuxNode', record =>
        record.PrimaryMac === metadata.PrimaryMac);

    let nodeId;
    if (record) {
      console.log('Identified', metadata.PrimaryMac, 'as LinuxNode', record.id);
      nodeId = await this.dustClient.updateRecord(record, metadata);
    } else {
      console.log('Creating LinuxNode for', metadata.PrimaryMac);
      nodeId = await this.dustClient.createRecord('LinuxNode', metadata);
    }

    // for (const iface of metadata.Interfaces) {
    //   await this.upsertInterface(nodeId, iface);
    // }

    if (!this.knownNodes.has(nodeId)) {
      console.log('JIT-creating LinuxNode instance for new NodeId', nodeRecord.id);
      const newObj = new LinuxNode(this);
      this.knownNodes.set(nodeRecord.id, newObj);
    }
    const nodeObj = this.knownNodes.get(nodeId);
    // nodeObj.attachClient(client); // TODO: do at subscribe-time?
    this.connectedNodes.set(client, nodeObj);

    return nodeId;
  }

  async syncNetDevices(client, deviceList) {
    console.log('client', client, 'sent', deviceList.length, 'net devices');
    // TODO
  }

  async upsertInterface(nodeId, iface) {
    console.log('Matching iface', iface.InterfaceName);

    const allocations = iface.Addresses.map(addr => {
      const [base, preLen] = addr.split('/');
      const allocMatch = this.dustClient
        .findRecord('Allocation', record =>
          record.BaseAddress === base
          && record.PrefixLength === parseInt(preLen));
      return allocMatch ? allocMatch.id : addr;
    });
    console.log('allocations', allocations);

    const directMatch = this.dustClient
      .findRecord('Interface', record =>
        record.NodeId === nodeId
        && record.InterfaceName === iface.InterfaceName);
    const keyMatch = this.dustClient
      .findRecord('Interface', record =>
        record.PublicKey === iface.PublicKey);

    let interfaceId;
    if (directMatch) {
      // TODO: update fields
      interfaceId = directMatch.id;
    } else if (keyMatch) {
      throw new Error(`TODO 2`);
    } else {
      interfaceId = await this.dustClient.createRecord('Interface', {
        NodeId: nodeId,
        InterfaceName: iface.InterfaceName,
        PublicKey: iface.PublicKey,
        // InternetEndpoint:
        ListenPort: iface.ListenPort,
        DirectAllocationIds: allocations,
      });
    }
    if (!interfaceId) return;

    for (const peer of iface.Peers) {
      console.log('visiting peer', peer);
      const peerMatch = this.dustClient
        .findRecord('Interface', record =>
          record.PublicKey === peer.PublicKey);

      let peerIfaceId;
      if (peerMatch) {
        // TODO: update InternetEndpoint using Endpoint?
        peerIfaceId = peerMatch.id;
      } else {
        console.log('Creating Interface for foreign peer', peer.PublicKey);
        peerIfaceId = await this.dustClient.createRecord('Interface', {
          PublicKey: peer.PublicKey,
          InternetEndpoint: peer.Endpoint,
          // LatestHandshake: peer.LatestHandshake,
          ListenPort: peer.Endpoint ? parseInt(peer.Endpoint.split(':')[1]) : null,
          // DirectAllocationIds: allocations,
        });
      }

      const tunnelMatch = this.dustClient
        .findRecord('Tunnel', record =>
          record.InterfaceIds.includes(interfaceId)
          && record.InterfaceIds.includes(peerIfaceId));
      if (tunnelMatch) {
        // TODO: update LatestHandshake
      } else {
        console.log('Creating Tunnel to peer', peer.PublicKey);
        await this.dustClient.createRecord('Tunnel', {
          InterfaceIds: [ interfaceId, peerIfaceId ],
          LatestHandshake: peer.LatestHandshake,
        });
      }
    }
  }
}
