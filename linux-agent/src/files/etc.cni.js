const promisify = require('util').promisify;
const {join, extname, basename} = require('path');
const readDir = promisify(require('fs').readdir);
const readFile = promisify(require('fs').readFile);
// can't use because permissions
// const writeFile = promisify(require('fs').writeFile);
// const unlink = promisify(require('fs').unlink);
const execa = require('execa');

const NETD_DIR = '/etc/cni/net.d';

exports.test = async function() {
  try {
    await readDir(NETD_DIR);
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return false;
  }
}

exports.readConfList = async filename => {
  const path = join(NETD_DIR, filename);
  const rawData = JSON.parse(await readFile(path));
  const bridgePlugin = rawData.plugins.find(x => x.type === 'bridge');
  const ipamConfig = bridgePlugin ? bridgePlugin.ipam : null;
  const dnsConfig = rawData.plugins[0].dns || null;
  return {
    ConfListName: basename(filename, '.conflist'),
    NetworkName: rawData.name,
    CniVersion: rawData.cniVersion,
    PluginList: rawData.plugins.map(p => p.type),
    DeviceName: bridgePlugin ? bridgePlugin.bridge : null,
    IpamType: ipamConfig ? ipamConfig.type : null,
    IpamRoutes: ipamConfig ? ipamConfig.routes.map(x => [x.dst, x.gw].filter(x=>x).join(`\t`)) : null,
    IpamSubnets: ipamConfig ? ipamConfig.ranges.map(x => x.map(y => [y.subnet, y.gateway].filter(y=>y).join(`\t`)).join(`\n`)) : null,
    DnsNameservers: dnsConfig ? dnsConfig.nameservers : null,
    DnsSearch: dnsConfig ? dnsConfig.search : null,
  };
};

exports.listAllNetworks = async function() {
  const list = await readDir(NETD_DIR);
  return list
    .filter(f => extname(f) === '.conflist')
    .map(f => basename(f, '.conflist'));
};

exports.dumpAllNetworks = async function() {
  const list = await readDir(NETD_DIR);
  return Promise.all(list
    .filter(f => extname(f) === '.conflist')
    .map(exports.readConfList));
};

exports.writeNetwork = async function (config) {
  const path = join(NETD_DIR, config.ConfListName+'.conflist');
  const json = JSON.stringify(exports.exportNetwork(config), null, 4);

  // bail if no different than current
  try {
    const currentVal = await readFile(path, 'utf-8');
    if (json === currentVal) return;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // write it with sudo
  console.log('cni: Writing', json.length, 'chars to', path);
  await execa(`sudo`, [`tee`, path], { input: json });
  // await writeFile(path, json, 'utf-8');
};

exports.deleteNetwork = async function (confListName) {
  const path = join(NETD_DIR, confListName+'.conflist');
  console.log('WARN: deleting CNI conflist', confListName);
  await execa(`sudo`, [`rm`, path]);
  // await unlink(path);
};

exports.exportNetwork = function (config) {
  // inflate the plugin list into sensible defaults
  const data = {
    cniVersion: config.CniVersion,
    name: config.NetworkName,
    plugins: config.PluginList.map(type => {
      switch (type) {
        case 'bridge':
          return {type, bridge: config.DeviceName, isGateway: true, ipMasq: true};
        case 'macvlan':
          return {type, master: config.DeviceName};
        case 'portmap':
          return {type, capabilities: {portMappings: true}};
        case 'firewall':
          return {type, backend: 'iptables'};
        case 'tuning':
          return {type}; // TODO
        default:
          throw new Error(`CNI plugin ${type} not implemented`);
      }
    }),
  };

  // build up extra config for the first 'primary' plugin
  const primaryOpts = {};
  if (config.DnsNameservers) {
    primaryOpts.dns = {
      nameservers: config.DnsNameservers,
      search: config.DnsSearch,
    };
  }
  if (config.IpamType) {
    switch (config.IpamType) {
      case 'host-local':
        primaryOpts.ipam = {
          type: config.IpamType,
          routes: config.IpamRoutes.map(x => {
            const [dst, gw] = x.split('\t');
            const route = {dst};
            if (gw) route.gw = gw;
            return route;
          }),
          ranges: config.IpamSubnets.map(x => x.split('\n').map(y => {
            const [subnet, gw] = y.split('\t');
            const range = {subnet};
            if (gw) range.gateway = gw;
            return range;
          })),
        };
        break;
      case 'dhcp':
        primaryOpts.ipam = {
          type: config.IpamType,
        };
      default:
        throw new Error(`IPAM plugin ${config.IpamType} not implemented`);
    }
  }
  data.plugins[0] = {...data.plugins[0], ...primaryOpts};

  return data;
}


// basic test entrypoint
if (require.main === module) {
  (async () => {

    if (await exports.test()) {
      for (const net of await exports.dumpAllNetworks()) {
        console.log(net);
        const path = join(NETD_DIR, net.ConfListName+'.conflist');
        const original = (await readFile(path, 'utf-8')).replace(/\t/g, '        ').trim();
        const after = JSON.stringify(exports.exportNetwork(net), null, 4);
        console.log('JSON roundtripped exactly:', original == after);
      }
    } else {
      console.log('CNI folder not found');
    }

  })();
}
