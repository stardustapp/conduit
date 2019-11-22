const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);
const exec = promisify(require('child_process').exec);

async function execForLine(cmd) {
  const {stdout, stderr} = await exec(cmd);
  if (stderr.length > 0) {
    return stderr.trim();
  }
  return stdout.trim();
}

const os = require('os');
const fs = require('fs');
const osRelease = {};
for (const line of fs.readFileSync('/etc/os-release').toString('utf8').split('\n')) {
  const sIdx = line.indexOf('=');
  if (sIdx < 0) continue;
  let rawVal = line.slice(sIdx+1);
  if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
    rawVal = rawVal.slice(1, -1);
  }
  osRelease[line.slice(0, sIdx)] = rawVal;
}

const SimpleDDP = require('simpleddp');
const ws = require('ws');
const process = require('process');

const ddpclient = new SimpleDDP({
  endpoint: process.env.CONDUIT_WS_URI || "ws://localhost:8080/websocket",
  SocketConstructor: ws,
  reconnectInterval: 5000
});

ddpclient.on('disconnected', () => {
  console.warn('Disconnected from DDP! Bailing...');
  process.exit(5);
});

async function dumpIfaces() {
  const wgRaw = await execForLine(`sudo wg show all dump`);
  const ifaces = {};
  for (const line of wgRaw.split('\n')) {
    const parts = line.split('\t');
    if (parts[0] in ifaces) {
      ifaces[parts[0]].Peers.push({
        PublicKey: parts[1],
        // PreSharedKey: parts[2],
        Endpoint: parts[3] === '(none)' ? null : parts[3],
        AllowedIPs: parts[4],
        LatestHandshake: parts[5] === '0' ? null : new Date(parseInt(parts[5])*1000),
        // TransferRx: parseInt(parts[6]),
        // TransferTx: parseInt(parts[7]),
        // PersistentKeepalive: parts[7] === 'off' ? -1 : parseInt(parts[7]),
      });
    } else {
      ifaces[parts[0]] = {
        // PrivateKey: parts[1],
        PublicKey: parts[2],
        ListenPort: parseInt(parts[3]),
        // FwMark: parts[4] === 'off' ? -1 : parts[4],
        Peers: [],
      };
    }
  }

  const addrRaw = await execForLine(`ip -br addr show`);
  for (const line of addrRaw.split('\n')) {
    const [iface, _, ...addrs] = line.trim().split(/ +/);
    if (iface in ifaces) {
      ifaces[iface].Addresses = addrs;
    }
  }

  return ifaces;
}

async function tryFindingWgKernelModule() {
  try {
    const kernelModules = await execForLine(`lsmod`);
    return kernelModules.split('\n').some(x => x.startsWith('wireguard'));
  } catch (err) {
    console.warn("Warn: `lsmod` failed, assuming wireguard isn't loaded");
    return false;
  }
}

(async () => {

  console.log('connecting...');
  await ddpclient.connect();
  console.log('upstream connected');

  const defaultRoute = await execForLine(`ip route get 8.8.8.8`);
  const primaryIfaceMatch = defaultRoute.match(/ dev ([^ ]+)/);
  if (!primaryIfaceMatch) throw new Error(
    `Couldn't find a default route with 'ip route'`);
  const primaryIfaceId = primaryIfaceMatch[1];
  const primaryIface = os.networkInterfaces()[primaryIfaceId];

  // Check if systemd is willing to have a conversation
  const systemdStatus = await execForLine(`systemctl status wg-quick@.service || true`);
  const hasSystemd = systemdStatus.includes('wg-quick@.service');

  const identity = await ddpclient.call('/LinuxNode/identify', {
    SelfHostname: os.hostname(),
    OsRelease: osRelease,
    InitFlavor: hasSystemd ? 'systemd' : 'unknown',
    PrimaryMac: primaryIface[0].mac,
    UserInfo: os.userInfo(),
    HasKernelModule: await tryFindingWgKernelModule(),
    Interfaces: await dumpIfaces(),
  });
  console.log({identity});

  // subscribe to our data
  const nodeSub = ddpclient.subscribe('/LinuxNode/config', identity.id);
  await nodeSub.ready();

  const interfaces = ddpclient.collection('interfaces').fetch();
  console.log('received', interfaces.length, 'interfaces');

  console.log('Sleeping...');
  while (true) {
    await sleepMs(30 * 1000);
    ddpclient.ddpConnection.messageQueue.push({ msg: 'ping' });
  }

  console.log('disconnecting...');
  await ddpclient.disconnect();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
