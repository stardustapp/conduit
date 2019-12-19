const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);
const process = require('process');
const os = require('os');

const ws = require('ws');
const SimpleDDP = require('simpleddp');

global.TODO = function (msg) {
  console.warn('--> TODO:', msg);
}

const {PuppetManager} = require('./puppets/_manager.js');

const {checkForKernelModule} = require('./commands/lsmod.js');
const wgCmd = require('./commands/wg.js');
const ipCmd = require('./commands/ip.js');
const systemctlCmd = require('./commands/systemctl.js');
const dpkgQueryCmd = require('./commands/dpkg-query.js');
const smartctlCmd = require('./commands/smartctl.js');
const podmanCmd = require('./commands/podman.js');
const {readOsRelease} = require('./files/etc.os-release.js');
const cniFile = require('./files/etc.cni.js');

const packageJson = require('../package.json');

const ddpclient = new SimpleDDP({
  endpoint: process.env.CONDUIT_WS_URI || "ws://localhost:8080/websocket",
  SocketConstructor: ws,
  reconnectInterval: 5000,
});

ddpclient.on('disconnected', () => {
  console.warn('Disconnected from DDP! Bailing...');
  process.exit(5);
});

(async () => {
  console.log();

  const osRelease = await readOsRelease();
  const hasSystemd = await systemctlCmd.canConverse();

  const hasWgTools = await wgCmd.test();
  const hasWgQuickUnit = hasSystemd && await systemctlCmd.hasUnitFile('wg-quick@.service');

  const primaryIfaceId = await ipCmd.getDefaultDevice();
  const primaryIface = os.networkInterfaces()[primaryIfaceId];

  console.log('connecting...');
  await ddpclient.connect();
  console.log('upstream connected');

  const identity = await ddpclient.call('/Node/Register', {
    // Node
    AgentVersion: packageJson.version,
    InternalAddresses: primaryIface.map(x => x.address),
    // LinuxNode
    SelfHostname: os.hostname(),
    OsRelease: osRelease,
    InitFlavor: hasSystemd ? 'systemd' : 'unknown',
    PrimaryMac: primaryIface[0].mac,
    UserInfo: os.userInfo(),
    HasWgKernelModule: await checkForKernelModule('wireguard'),
    SelfDrivingAvailable: [ // TODO: all these hard-codeds
      (await dpkgQueryCmd.isPkgInstalledOk('conduit-agent')) && 'AgentUpgrade',
      (await cniFile.test()) && 'ContainerNetwork',
      (await ipCmd.test()) && 'NetDevice',
      (await smartctlCmd.test()) && 'SmartDrive',
      (await podmanCmd.test()) && 'PodMan',
      (hasWgTools && hasWgQuickUnit) && 'WireGuard',
    ].filter(x => x),
  });
  console.log('Registered with mesh controller.', identity);

  // hook self-driving controller clients
  const puppetManager = new PuppetManager(ddpclient);

  // subscribe to our data
  const nodeSub = ddpclient.subscribe('/Node/SelfDriving', identity);
  await nodeSub.ready();

  const controllers = ddpclient.collection('Controllers').fetch();
  console.log('Received', controllers.length, 'Controller records');

  console.log('Sleeping...');
  while (true) {
    await sleepMs(55 * 1000);
    ddpclient.ddpConnection.messageQueue.push({ msg: 'ping' });
  }

  console.log('disconnecting...');
  await ddpclient.disconnect();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
