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

  const kernelModules = await execForLine(`lsmod`);
  const hasKernelModule = kernelModules.split('\n').some(x => x.startsWith('wireguard'));

  const identity = await ddpclient.call('/LinuxNode/identify', {
    SelfHostname: os.hostname(),
    OsRelease: osRelease,
    InitFlavor: hasSystemd ? 'systemd' : 'unknown',
    PrimaryMac: primaryIface[0].mac,
    UserInfo: os.userInfo(),
    HasKernelModule: hasKernelModule,
  });
  console.log({identity});

  // subscribe to our data
  const nodeSub = ddpclient.subscribe('/LinuxNode/config', identity.id);
  await nodeSub.ready();

  const interfaces = ddpclient.collection('interfaces').fetch();
  console.log('received', interfaces.length, 'interfaces');

  console.log('Sleeping...');
  while (true) {
    await sleepMs(60 * 1000);
  }

  console.log('disconnecting...');
  await ddpclient.disconnect();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
