const debounce = require('debounce');

class WireGuardSelfDrivingNode {
  constructor(nodeHandle, subscriber, {identitiesCursor, getPeeringsCursor}) {
    this.nodeHandle = nodeHandle;
    this.subscriber = subscriber;

    this.identitiesCursor = identitiesCursor;
    // this.getPeeringsCursor = getPeeringsCursor;

    // this.latestObservation = null; // snapshot of latest client submission
    this.deviceIdentites = new Map; // DeviceName string => WgIdentity instance
  }

  stop() {
    TODO(`stop WireGuardSelfDrivingNode`)
  }
}

exports.WireGuard = class WireGuardController {
  constructor(recordManager, metrics) {
    this.recordManager = recordManager;
    this.metrics = metrics;

    this.allIdentities = new Array; // WgIdentity handles
    this.knownPublicKeys = new Map; // PublicKey string => WgIdentity instance
    this.runningNodes = new Array; // WireGuardSelfDrivingNode instances

    this.markMeshDirty = debounce(() => this.calculateMesh(), 1000);

    // this.identityNodes = new Map; // identityId => WireGuardSelfDrivingNode
    // this.latestObservations = new Map; // nodeId => {configs, units, devices}

    let isReady = false;
    const identityObserver = this.recordManager.observeRecords('WgIdentity', {
      onAdded: (identityId, handle) => {
        this.allIdentities.push(handle.instance);

        const {PublicKey} = handle.latestData;
        if (PublicKey && !PublicKey.startsWith('(')) {
          this.knownPublicKeys.set(PublicKey, handle.instance);
        }

        if (isReady) this.markMeshDirty();
      },
      onReady: (identityMap) => {
        isReady = true;
        this.markMeshDirty();
      },
    });
  }

  calculateMesh() {

    TODO(`Calculate WireGuard mesh`);
    for (const identity of this.allIdentities) {
      identity.link(this);
    }
  }

  // "Self-drive" by just telling the box when things change
  // Actual changes are done through the node->api sync
  publishSelfDriving(nodeHandle, subscriber) {
    return new WireGuardSelfDrivingNode(nodeHandle, subscriber, {
      identitiesCursor: this.getIdentitiesCursor(nodeHandle._id),
      getPeeringsCursor: this.getPeeringsCursor.bind(this),
    });

    // subscriber.informFields({nonce: Math.random()});
    // return identCursor.onChange(() => {
    //   subscriber.informFields({nonce: Math.random()});
    // });
  }
  getIdentitiesCursor(nodeId) {
    return this.recordManager
      .findRecordsRaw('WgIdentity', record =>
        record.NodeId === nodeHandle._id);
  }
  getPeeringsCursor(identityId) {
    return this.recordManager
      .findRecordsRaw('WgPeering', record =>
        record.NodeId === nodeHandle._id);
  }

  async upsertLocalWgIdentity({PublicKey, NodeId, DeviceName, ListenPort}) {
    if (!DeviceName) throw new Error(
      `Local WgIdentity objects must be addressed using DeviceName`);

    // Look for unowned instances of the PK
    // A peer reporting the tunnel could have created this
    const [match] = PublicKey ? this.recordManager
      .findRecords('WgIdentity', record =>
        !record.NodeId && record.PublicKey === PublicKey) : [];
    if (match) {

      // Adopt and return the PK identity
      await match.commitFields({NodeId, DeviceName, ListenPort});
      return match;

    } else {
      // Create a fresh identity
      return await this.recordManager
        .commitNew('WgIdentity', {PublicKey, NodeId, DeviceName, ListenPort});
    }
  }

  async ensureRemoteWgIdentity({PublicKey, InternetEndpoint}) {
    if (!PublicKey) throw new Error(
      `Remote WgIdentity objects cannot be addressed without a PublicKey`);

    // Look for any instance of the PK
    // Can come from many sources
    const [match] = this.recordManager
      .findRecords('WgIdentity', record =>
        record.PublicKey === PublicKey);
    if (match) {

      // Attach our InternetEndpoint if it wasn't known before
      // If there is one then don't overwrite that, it might be a DNS name
      if (InternetEndpoint && !match.InternetEndpoint) {
        await match.commitFields({InternetEndpoint});
      }

      return match;

    } else {
      // Create a fresh identity
      return await this.recordManager
        .commitNew('WgIdentity', {PublicKey, InternetEndpoint});
    }
  }

  async syncActualState(nodeHandle, {configs, identities, units, willSelfDrive}) {
    // Look up what we already know
    const knownIdentities = this.recordManager
      .findRecords('WgIdentity', record =>
        record.NodeId === nodeHandle._id);

    // TODO: self-driving instructions
    const actions = new Array;
    function considerFieldAction(action, actual, desired, keyList=null) {
      const fields = {};
      for (const key of keyList || Object.keys(desired)) {
        const act = actual[key], des = desired[key];
        if (act !== des) {
          fields[key] = des;
        }
      }
      if (Object.keys(fields).length > 0) {
        actions.push({...action, fields});
      }
    }

    const knownDevs = new Map;
    const extraIdents = new Set();
    for (const knownIdentity of knownIdentities) {
      const {DeviceName} = knownIdentity.latestData;
      if (knownDevs.has(DeviceName)) {
        console.log('WARN: found duplicated NetDevice somehow?', knownIdentity);
      } else {
        knownDevs.set(DeviceName, knownIdentity);
      }
      extraIdents.add(knownIdentity);
    }

    for (const iface of identities) {
      const {PublicKey, DeviceName, ListenPort, FwMark, Peers} = iface;
      // console.log('Node', nodeHandle, 'sent WG pubkey', PublicKey);
      let identity = knownDevs.get(DeviceName);

      const unit = (units||[]).find(u => u.DeviceName === DeviceName) || {};
      const config = (configs||[]).find(c => c.Interface === DeviceName) || {};
      const dynamicFields = {
        ListenPort, FwMark,
        UnitStatus: unit.State,
        UnitEnabled: unit.Enabled,
        SelfAddresses: config.Addresses,
        SelfDns: config.DnsServers,
      };
      // console.log(iface, unit, config);

      // Change behavior based on which direction state should flow
      if (willSelfDrive) {
        if (!identity) {
          actions.push({type: 'delete device', DeviceName});
        } else if (identity.latestData.PublicKey === '(new)') {
          // allow for the agent to locally generate new keys
          // no immediate action. next sync can handle fix-ups normally
          identity = await this.upsertLocalWgIdentity({
            NodeId: nodeHandle._id,
            PublicKey, DeviceName,
            ...dynamicFields,
          });
        } else {
          // TODO: when to send config file?
          // const configFile = await this.recordManager.dustClient.callServerMethod('RenderWgConfig', goneIdent._id);
          considerFieldAction({type: 'configure device', DeviceName, IdentityId: identity._id},
            identity.latestData, iface, ['PublicKey', 'ListenPort']);
          considerFieldAction({type: 'configure systemd', DeviceName},
            identity.latestData, dynamicFields, ['UnitStatus', 'UnitEnabled']);
        }

      } else {
        if (identity && identity.latestData.PublicKey == PublicKey) {
          await identity.commitFields(dynamicFields);
        } else {
          identity = await this.upsertLocalWgIdentity({
            NodeId: nodeHandle._id,
            PublicKey, DeviceName,
            ...dynamicFields,
          });
          console.log('Node', nodeHandle, 'created WG identity', identity, 'for', DeviceName);
        }

      }
      extraIdents.delete(identity);

      // Sync peers
      identity && await this.syncIfacePeers(nodeHandle, identity, Peers);
    }

    for (const goneIdent of extraIdents) {
      const {PublicKey, DeviceName, ListenPort} = goneIdent.latestData;

      if (willSelfDrive) {
        const configFile = await this.recordManager.dustClient.callServerMethod('RenderWgConfig', goneIdent._id);
        actions.push({type: 'create device', DeviceName, PublicKey, configFile});
        considerFieldAction({type: 'configure systemd', DeviceName},
          goneIdent.latestData, {}, ['UnitStatus', 'UnitEnabled']);

      // condition TODO
      } else if (PublicKey && PublicKey !== '(none)' && PublicKey !== '(new)') {
        // Unlink keyed interfaces since the key material might still be relevant
        await goneIdent.commitFields({
          NodeId: null,
          DeviceName: null,
        });

      } else {
        // Delete unkeyed interfaces, they're anonymous
        await goneIdent.hardDelete();
      }
    }

    console.log('Completed WireGuard actual sync');
    if (willSelfDrive) console.log('Sending WireGuard selfdriving actions:', actions);
    return {actions};
  }

  async syncIfacePeers(nodeHandle, identityHandle, peerList) {
    const knownPeerings = this.recordManager
      .findRecords('WgPeering', record =>
        record.LocalIdentityId === identityHandle._id);
    const knownTunnels = this.recordManager
      .findRecords('WgTunnel', record =>
        record.WgIdentityIds.includes(identityHandle._id));

    const ifaceMetrics = this.metrics.withNodeTimeSlot({
      nodeId: nodeHandle._id,
      startTime: identityHandle.latestData.createdAt, // TODO: last reset date
      endTime: new Date(),
      fixedLabels: {
        local_key: identityHandle.latestData.PublicKey,
      }});

    for (const peer of peerList) {
      // TODO: use cached publickey list
      const remoteIdentity = await this.ensureRemoteWgIdentity({
        PublicKey: peer.PublicKey,
        InternetEndpoint: peer.Endpoint,
      });
      console.log('remote ident', remoteIdentity, 'for', peer.PublicKey);

      const tunnelFields = {
        PreSharedKey: peer.PreSharedKey,
        IsEnabled: true, // TODO: only if 'Observing'
      };
      let tunnel = knownTunnels.find(t =>
        t.latestData.WgIdentityIds.includes(remoteIdentity._id));
      if (tunnel) {
        await tunnel.commitFields(tunnelFields);
      } else {
        tunnel = await this.recordManager.commitNew('WgTunnel', {
          WgIdentityIds: [identityHandle._id, remoteIdentity._id],
          ...tunnelFields,
        });
      }

      const peeringFields = {
        LatestHandshake: peer.LatestHandshake,
        TransferRx: peer.TransferRx,
        TransferTx: peer.TransferTx,
        PersistentKeepalive: peer.PersistentKeepalive,
        AllowedIps: peer.AllowedIps,
      };

      let peering = knownPeerings.find(p =>
        p.latestData.WgTunnelId === tunnel._id);
      if (peering) {
        const {TransferRx, TransferTx} = peering.latestData;
        await peering.commitFields({
          TransferRxDelta: (TransferRx >= 0 && TransferRx <= peer.TransferRx)
            ? (peer.TransferRx - TransferRx) : null,
          TransferTxDelta: (TransferTx >= 0 && TransferTx <= peer.TransferTx)
            ? (peer.TransferTx - TransferTx) : null,
          ...peeringFields,
        });

        // submit Transfer deltas to e.g. gcloud
        const labels = {
          peer_key: remoteIdentity.latestData.PublicKey,
        };
        ifaceMetrics.pushMetricPoint({
          type: 'custom.googleapis.com/wireguard/bytes_sent',
          metricKind: 'CUMULATIVE',
          labels,
          valueType: 'INT64',
          value: TransferTx,
        });
        ifaceMetrics.pushMetricPoint({
          type: 'custom.googleapis.com/wireguard/bytes_received',
          metricKind: 'CUMULATIVE',
          labels,
          valueType: 'INT64',
          value: TransferRx,
        });
        if (peer.LatestHandshake) {
          const ageInMins = (new Date() - peer.LatestHandshake) / 1000 / 60;
          if (ageInMins < 30) {
            ifaceMetrics.pushMetricPoint({
              type: 'custom.googleapis.com/wireguard/handshake_age_mins',
              metricKind: 'GAUGE',
              labels,
              valueType: 'INT64',
              value: ageInMins,
            });
          }
        }

      } else {
        peering = await this.recordManager.commitNew('WgPeering', {
          LocalIdentityId: identityHandle._id,
          ForeignIdentityId: remoteIdentity._id,
          WgTunnelId: tunnel._id,
          ...peeringFields,
        });
      }

    } // each peer

  }
}
