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

      // Sync peers
      await this.syncIfacePeers(nodeHandle, identity, Peers);
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

  async syncIfacePeers(nodeHandle, identityHandle, peerList) {
    const knownPeerings = this.recordManager
      .findRecords('WgPeering', record =>
        record.LocalIdentityId === identityHandle._id);
    const knownTunnels = this.recordManager
      .findRecords('WgTunnel', record =>
        record.WgIdentityIds.includes(identityHandle._id));

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
