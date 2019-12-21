const {execForBuffer} = require('./_lib.js');

exports.test = async function() {
  try {
    await execForBuffer(`sudo wg help`);
    return true;
  } catch (err) {
    console.log(`can't use wireguard-tools:`, err);
    return false;
  }
}

exports.dumpAll = async function() {
  const wgRaw = await execForBuffer(`sudo wg show all dump`, 'stdout', 'utf-8');
  if (!wgRaw) return [];

  const identityMap = {};
  const identityList = [];
  for (const line of wgRaw.trim().split('\n')) {
    const parts = line.split('\t');

    if (!(parts[0] in identityMap)) {
      // first line for iface is our own config
      const [ DeviceName,
        PrivateKey, PublicKey,
        ListenPort, FwMark,
      ] = parts;

      identityMap[DeviceName] = {
        DeviceName, PublicKey,
        ListenPort: parseInt(ListenPort),
        FwMark: FwMark === 'off' ? null : FwMark,
        Peers: [], // to be filled
      };
      identityList.push(identityMap[DeviceName]);

    } else {
      // extra iface lines are each a remote peer
      const [
        DeviceName, PublicKey,
        PreSharedKey, Endpoint, AllowedIPs,
        LatestHandshake, TransferRx, TransferTx, PersistentKeepalive,
      ] = parts;
      // TODO: grab InternetEndpoint from config file, in case it's a DNS name

      identityMap[parts[0]].Peers.push({
        PublicKey,
        PreSharedKey: PreSharedKey === '(none)' ? null : PreSharedKey,
        Endpoint: Endpoint === '(none)' ? null : Endpoint,
        AllowedIps: AllowedIPs === '(none)' ? [] : AllowedIPs.split(','),
        LatestHandshake: LatestHandshake === '0' ? null : new Date(parseInt(LatestHandshake)*1000),
        TransferRx: parseInt(TransferRx),
        TransferTx: parseInt(TransferTx),
        PersistentKeepalive: PersistentKeepalive === 'off' ? null : parseInt(PersistentKeepalive),
      });
    }
  }

  return identityList;
};
