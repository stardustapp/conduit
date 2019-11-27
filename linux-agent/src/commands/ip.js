const {execForLine} = require('./_lib.js');

function mapLinkInfo(kind, info) {
  switch (kind) {
    case 'veth':
    case 'wireguard':
    case 'dummy':
      return {kind};
    case 'bridge':
      return {kind,
        state: info.state,
        hairpin: info.hairpin,
        id: info.id,
        bridge_id: info.bridge_id,
      };
    case 'vxlan':
      return {kind,
        id: info.id,
        local: info.local,
        port: info.port,
        link: info.link,
      };
    default:
      console.warn('WARN: Unrecognized net device info kind', kind);
      return {kind};
  }
}

function mapDeviceJson(device) {
  const {
    ifindex, ifname, flags,
    link_type, address, broadcast, linkinfo,
    addr_info,
  ...extras } = device;

  const extrasWhitelist = [
    'mtu', 'qdisc', 'operstate', 'group',
    'master', 'promiscuity', 'txqlen',
    'link_netnsid', 'link_index',
  ];
  const extrasBlacklist = [
    'num_rx_queues', 'num_tx_queues',
    'gso_max_size', 'gso_max_segs',
    'min_mtu', 'max_mtu',
    'vfinfo_list', // seemingly always empty array
  ]
  const netParams = {};
  for (const key in extras) {
    if (extrasWhitelist.includes(key)) {
      netParams[key] = extras[key];
    } else if (!extrasBlacklist.includes(key)) {
      console.log('tossing device extra', key, extras[key]);
    }
  }

  const {
    info_kind, info_data,
    info_slave_kind, info_slave_data,
  } = linkinfo || {};
  const LinkInfo = info_kind
    ? mapLinkInfo(info_kind, info_data) : null;
  const SlaveLinkInfo = info_slave_kind
    ? mapLinkInfo(info_slave_kind, info_slave_data) : null;

  return {
    DeviceName: ifname,
    NetFlags: flags,
    NetParams: netParams,
    LinkType: link_type,
    LinkAddr: address,
    LinkBroadcast: broadcast,
    LinkInfo, SlaveLinkInfo,
    Addresses: addr_info.map(addr => ({
      Family: addr.family,
      LocalAddr: addr.local,
      PrefixLen: addr.prefixlen,
      Broadcast: addr.broadcast,
      Scope: addr.scope,
      Label: addr.label,
    })),
  };
}

exports.dumpDevices = async function dumpDevices() {
  const rawData = JSON.parse(await execForLine(`ip -json -details addr`));
  // const rawData = JSON.parse(await execForLine(`cat src/commands/ip-specimen/apt-server.json`));
  return rawData.map(mapDeviceJson);
};


exports.showAddrs = async function() {
  const addrRaw = await execForLine(`ip -br addr show`);
  return addrRaw
    .split('\n')
    .map(line => {
      const [Device, Status, ...Addresses] = line.trim().split(/ +/);
      return {Device, Status: Status.toLowerCase(), Addresses};
    });
};


exports.getDefaultDevice = async function() {
  const defaultRoute = await execForLine(`ip route get 8.8.8.8`);
  const primaryIfaceMatch = defaultRoute.match(/ dev ([^ ]+)/);
  if (!primaryIfaceMatch) throw new Error(
    `Couldn't find a default route with 'ip route'`);
  return primaryIfaceMatch[1];
};


// basic test entrypoint
if (require.main === module) {
  const fs = require('fs');
  const {join, extname} = require('path');
  (async function() {
    const testRoot = 'src/commands/ip-specimen';
    const jsonFiles = fs.readdirSync(testRoot);
    for (const jsonFile of jsonFiles) {
      if (extname(jsonFile) !== '.json') continue;
      console.log(jsonFile);
      const file = fs.readFileSync(join(testRoot, jsonFile), 'utf-8');
      const output = JSON.stringify(JSON.parse(file).map(mapDeviceJson), null, 2);
      console.log(' ', file.split(',').length, '->', output.split(',').length, 'lines');
    }
    console.log()
    console.log(JSON.stringify(await exports.dumpDevices(), null, 2));
  })();
}
