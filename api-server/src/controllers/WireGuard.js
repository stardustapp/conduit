exports.WireGuard = class WireGuardController {
  constructor(recordManager) {
    this.recordManager = recordManager;
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

  async syncActualState(nodeHandle, {identities}) {
    // Look up what we already know
    const knownIdentities = this.recordManager
      .findRecords('WgIdentity', record =>
        record.NodeId === nodeHandle._id);

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
      const {PublicKey, DeviceName, ListenPort, Peers} = iface;
      console.log('Node', nodeHandle, 'sent WG pubkey', PublicKey);

      let identity = knownDevs.get(DeviceName);
      if (identity && identity.latestData.PublicKey == PublicKey) {
        await identity.commitFields({ListenPort});
      } else {
        identity = await this.upsertLocalWgIdentity({
          NodeId: nodeHandle._id,
          PublicKey, DeviceName, ListenPort,
        });
        console.log('Node', nodeHandle, 'created WG identity', identity, 'for', DeviceName);
      }
      extraIdents.delete(identity);

      TODO('WG cache known peers');
      for (const peer of Peers) {
        TODO(`WG peer upsert ${JSON.stringify(peer)}`);
        //const peerIdentity = await this.ensureRemoteWgIdentity('')
      }
    }

    for (const goneIdent of extraIdents) {
      if (goneIdent.latestData.PublicKey) {
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
  }
}

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
