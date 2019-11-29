const {RecordHandle} = require('./record-handle.js');
const {ClassCompiler} = require('./class-compiler.js');

function readTypeName(typeName) {
  return typeName.includes(':')
    ? typeName : `my:${typeName}`;
}

exports.RecordManager = class RecordManager {
  constructor(dustClient, recordImpls={}) {
    this.dustClient = dustClient;
    this.recordInstances = new Map; // record id -> custom class instance
    this.recordImpls = recordImpls; // local name -> JS constructor

    const compiler = new ClassCompiler();
    compiler.registerCore();

    // Bring in custom types
    const customRecords = this
      .dustClient.resourceCollection
      .filter(record => record.type === 'CustomRecord');
    for (const rawType of customRecords.fetch()) {
      compiler.registerCustomRecord(rawType);
    }

    this.typeMap = compiler.finish();

    customRecords.onChange( ({prev,next}) => {
      console.warn('TODO: A CustomRecord was updated!');
      process.exit(9);
    });
  }

  fetchRecordData(recordId) {
    const list = this.dustClient.recordCollection
      .filter(record => record.id === recordId)
      .fetch();
    if (list.length < 1) throw new Error(
      `Failed to find record data for ID ${recordId}`);
    return list[0];
  }

  findRecords(typeName, selector=()=>true) {
    const classType = this.getClassType(typeName);
    // console.log(classType);
    return this
      .dustClient.recordCollection
      .filter(record => classType
        .allTypeNames.has(record.type)
        && selector(record))
      .fetch()
      .map(({type, id}) =>
        new RecordHandle(this, this.getClassType(type), id));
  }

  async commitMutation(recordId, mutatorCb, maxTries=3) {
    let triesLeft = maxTries;

    while (triesLeft >= 1) {
      const newRecord = mutatorCb(this.fetchRecordData(recordId));
      triesLeft--;

      try {
        const result = await this.dustClient.updateRecord(newRecord);
        return result.version;
      } catch (err) {
        console.log('commitMutation() on record', recordId, 'failed',
            'with', triesLeft, 'retries left.', err);
      }
      TODO('sleep a second, for safety');
    }
    throw new Error(`Ran out of retries mutating record ${recordId}`);
  }
  async commitNew(recordType, fieldData) {
    const classType = this.getClassType(recordType);
    const result = await this.dustClient.createRecord(classType.wireName, fieldData);
    // TODO('use custom impls if defined')
    // return classType.createWrapper(this, recordId);
    return new RecordHandle(this, classType, result.id);
  }

  hardDelete(id, type, version=null) {
    if (version === null) {
      return this.dustClient.hardDeleteRecord(this.fetchRecordData(id));
    } else {
      return this.dustClient.hardDeleteRecord({id, type, version});
    }
  }


  getClassType(typeName) {
    let fullName = readTypeName(typeName);
    if (!this.typeMap.has(fullName)) throw new Error(
      `DUST Resource '${typeName}' failed to resolve`);
    return this.typeMap.get(fullName);
  }

  // findNodeRelevantRecords(nodeId) {
  //   return this.dustClient.recordCollection
  //     .filter(record => record.NodeId === nodeId)
  //     .fetch();
  // }
  //
  // calculateMesh() {
  //   const prevNodeIds = new Set(this.knownNodes.keys());
  //   console.log('Previously known nodes:', prevNodeIds);
  //
  //   const linuxNodeRecords = this.dustClient.recordCollection
  //     .filter(record => record.type === 'LinuxNode');
  //
  //   for (const nodeRecord of linuxNodeRecords.fetch()) {
  //
  //     if (this.knownNodes.has(nodeRecord.id)) {
  //       prevNodeIds.delete(nodeRecord.id);
  //       const node = this.knownNodes.get(nodeRecord.id);
  //       node.applyConfig(nodeRecord);
  //     } else {
  //       console.log('introduced to new node', nodeRecord.id, nodeRecord.SelfHostname);
  //       const node = new LinuxNode(this, nodeRecord.id);
  //       node.applyConfig(nodeRecord);
  //       this.knownNodes.set(nodeRecord.id, node);
  //     }
  //   }
  //
  //   for (const prevNodeId of prevNodeIds) {
  //     console.log('Node', prevNodeId, 'disappeared!');
  //     const node = this.knownNodes.get(prevNodeId);
  //     this.knownNodes.delete(prevNodeId);
  //   }
  //
  //   for (const node of this.knownNodes.values()) {
  //     //console.log('Linking node', node);
  //     node.link();
  //   }
  //
  //   console.log('Calculated mesh of', Array.from(this.knownNodes.keys()).length, 'nodes');
  // }
  //
  // async publishLinuxNode(client) {
  //   const node = this.connectedNodes.get(client);
  //   if (!node) throw new Error(`Please register`);
  //
  //
  //   // const nodeRecord = this.dustClient
  //   //   .findRecord('LinuxNode', record =>
  //   //     record.id === nodeId);
  //   // console.log('Connected node is', nodeRecord.id);
  //   // client.sendMessage({ msg: 'added', collection: 'interfaces', id: 'CZevr7ikH6AGhvDc5', fields: {} });
  //
  //   await node.attachClient(client); // TODO: do at subscribe-time?
  //
  //   //this.connectedNodes.
  // }
  //
  // async updateLinuxNode(nodeId, fields) {
  //   const record = this.dustClient
  //     .findRecord('LinuxNode', record =>
  //       record.id === nodeId);
  //
  //   if (record) {
  //     console.log('Setting', fields, 'on LinuxNode', record.id);
  //     return this.dustClient.updateRecord(record, fields);
  //   } else throw new Error(`Node ${nodeId} not found`);
  // }
  //
  // async registerLinuxNode(client, metadata) {
  //   const record = this.dustClient
  //     .findRecord('LinuxNode', record =>
  //       record.PrimaryMac === metadata.PrimaryMac);
  //
  //   let nodeId;
  //   if (record) {
  //     console.log('Identified', metadata.PrimaryMac, 'as LinuxNode', record.id);
  //     nodeId = await this.dustClient.updateRecord(record, metadata);
  //   } else {
  //     console.log('Creating LinuxNode for', metadata.PrimaryMac);
  //     nodeId = await this.dustClient.createRecord('LinuxNode', metadata);
  //   }
  //
  //   // for (const iface of metadata.Interfaces) {
  //   //   await this.upsertInterface(nodeId, iface);
  //   // }
  //
  //   if (!this.knownNodes.has(nodeId)) {
  //     console.log('JIT-creating LinuxNode instance for new NodeId', nodeRecord.id);
  //     const newObj = new LinuxNode(this, nodeId);
  //     this.knownNodes.set(nodeRecord.id, newObj);
  //   }
  //   const nodeObj = this.knownNodes.get(nodeId);
  //   this.connectedNodes.set(client, nodeObj);
  //
  //   return nodeId;
  // }
  //
  // async syncNetDevices(client, deviceList) {
  //   const node = this.connectedNodes.get(client);
  //   if (!node) throw new Error(`Please register`);
  //
  //   console.log('client', client.sessionId, 'for', node.nodeId, 'sent', deviceList.length, 'net devices');
  //   // TODO
  // }
  //
  // async upsertInterface(nodeId, iface) {
  //   console.log('Matching iface', iface.InterfaceName);
  //
  //   const allocations = iface.Addresses.map(addr => {
  //     const [base, preLen] = addr.split('/');
  //     const allocMatch = this.dustClient
  //       .findRecord('Allocation', record =>
  //         record.BaseAddress === base
  //         && record.PrefixLength === parseInt(preLen));
  //     return allocMatch ? allocMatch.id : addr;
  //   });
  //   console.log('allocations', allocations);
  //
  //   const directMatch = this.dustClient
  //     .findRecord('Interface', record =>
  //       record.NodeId === nodeId
  //       && record.InterfaceName === iface.InterfaceName);
  //   const keyMatch = this.dustClient
  //     .findRecord('Interface', record =>
  //       record.PublicKey === iface.PublicKey);
  //
  //   let interfaceId;
  //   if (directMatch) {
  //     // TODO: update fields
  //     interfaceId = directMatch.id;
  //   } else if (keyMatch) {
  //     throw new Error(`TODO 2`);
  //   } else {
  //     interfaceId = await this.dustClient.createRecord('Interface', {
  //       NodeId: nodeId,
  //       InterfaceName: iface.InterfaceName,
  //       PublicKey: iface.PublicKey,
  //       // InternetEndpoint:
  //       ListenPort: iface.ListenPort,
  //       DirectAllocationIds: allocations,
  //     });
  //   }
  //   if (!interfaceId) return;
  //
  //   for (const peer of iface.Peers) {
  //     console.log('visiting peer', peer);
  //     const peerMatch = this.dustClient
  //       .findRecord('Interface', record =>
  //         record.PublicKey === peer.PublicKey);
  //
  //     let peerIfaceId;
  //     if (peerMatch) {
  //       // TODO: update InternetEndpoint using Endpoint?
  //       peerIfaceId = peerMatch.id;
  //     } else {
  //       console.log('Creating Interface for foreign peer', peer.PublicKey);
  //       peerIfaceId = await this.dustClient.createRecord('Interface', {
  //         PublicKey: peer.PublicKey,
  //         InternetEndpoint: peer.Endpoint,
  //         // LatestHandshake: peer.LatestHandshake,
  //         ListenPort: peer.Endpoint ? parseInt(peer.Endpoint.split(':')[1]) : null,
  //         // DirectAllocationIds: allocations,
  //       });
  //     }
  //
  //     const tunnelMatch = this.dustClient
  //       .findRecord('Tunnel', record =>
  //         record.InterfaceIds.includes(interfaceId)
  //         && record.InterfaceIds.includes(peerIfaceId));
  //     if (tunnelMatch) {
  //       // TODO: update LatestHandshake
  //     } else {
  //       console.log('Creating Tunnel to peer', peer.PublicKey);
  //       await this.dustClient.createRecord('Tunnel', {
  //         InterfaceIds: [ interfaceId, peerIfaceId ],
  //         LatestHandshake: peer.LatestHandshake,
  //       });
  //     }
  //   }
  // }
}
