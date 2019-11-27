const {execForLine} = require('./_lib.js');

exports.dumpAll = async function() {
  const wgRaw = await execForLine(`sudo wg show all dump`);
  if (!wgRaw) return [];

  const ifaces = {};
  const ifaceList = [];
  for (const line of wgRaw.split('\n')) {
    const parts = line.split('\t');

    if (!(parts[0] in ifaces)) {
      // first line for iface is our own config
      const [InterfaceName,
        PrivateKey, PublicKey, ListenPort, FwMark,
      ] = parts;

      ifaces[InterfaceName] = {
        type: 'WgInterface',
        InterfaceName, PublicKey,
        ListenPort: parseInt(ListenPort),
        FwMark: FwMark === 'off' ? null : FwMark,
        Peers: [], // to be filled
      };
      ifaceList.push(ifaces[InterfaceName]);

    } else {
      // extra iface lines are each a remote peer
      const [InterfaceName,
        PublicKey, PreSharedKey, Endpoint, AllowedIPs,
        LatestHandshake, TransferRx, TransferTx, PersistentKeepalive,
      ] = parts;

      ifaces[parts[0]].Peers.push({
        PublicKey,
        PreSharedKey: PreSharedKey === '(none)' ? null : PreSharedKey,
        Endpoint: Endpoint === '(none)' ? null : Endpoint,
        AllowedIPs: AllowedIPs.split(','),
        LatestHandshake: LatestHandshake === '0' ? null : new Date(parseInt(LatestHandshake)*1000),
        TransferRx: parseInt(TransferRx),
        TransferTx: parseInt(TransferTx),
        PersistentKeepalive: PersistentKeepalive === 'off' ? -1 : parseInt(PersistentKeepalive),
      });
    }
  }

  return ifaceList;
};
