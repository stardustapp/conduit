const promisify = require('util').promisify;
const {join, extname, basename} = require('path');
const readDir = promisify(require('fs').readdir);
const readFile = promisify(require('fs').readFile);
const writeFile = promisify(require('fs').writeFile);
const unlink = promisify(require('fs').unlink);

const CONF_DIR = '/etc/wireguard';

exports.test = async function() {
  try {
    await readDir(CONF_DIR);
    return true;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return false;
  }
}

// TODO: more complete parsing, for observing unloaded ifaces

exports.readBasics = async filename => {
  const path = join(CONF_DIR, filename+'.conf');
  const rawData = await readFile(path);

  const lines = rawData.toString('utf-8').split('\n');
  const readList = (lines, pattern) => []
    .concat(...lines
      .filter(l=>l
        .match(pattern))
      .map(l=>l
        .split('=')[1]
        .split(',')
        .map(x=>x
          .trim())));

  return {
    Addresses: readList(lines, /^Address[ =]/),
    DnsServers: readList(lines, /^Dns[ =]/),
    PeerCount: lines.filter(l => l.startsWith('[Peer]')).length,
  };
};

exports.listAllInterfaces = async function() {
  const list = await readDir(CONF_DIR);
  return list
    .filter(f => extname(f) === '.conf')
    .map(f => basename(f, '.conf'));
};

exports.dumpAllBasics = async function() {
  const list = await exports.listAllInterfaces();
  return Promise.all(list.map(Interface => exports
    .readBasics(Interface)
    .then(basics => ({Interface, ...basics}))));
};

exports.writeConfig = async function (interface, fullText) {
  const path = join(CONF_DIR, interface+'.conf');
  await writeFile(path, fullText, 'utf-8');
};

exports.deleteConfig = async function (interface) {
  const path = join(CONF_DIR, interface+'.conf');
  console.log('WARN: deleting wireguard config', interface);
  await unlink(path);
};

// basic test entrypoint
if (require.main === module) {
  (async () => {

    if (await exports.test()) {
      console.log('basics:', await exports.dumpAllBasics());
    } else {
      console.log('WireGuard folder not found');
    }

  })();
}
