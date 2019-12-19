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
const ipCmd = require('./commands/ip.js');
const systemctlCmd = require('./commands/systemctl.js');
const {readOsRelease} = require('./files/etc.os-release.js');

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

  const hasSystemd = await systemctlCmd.canConverse();

  const primaryIfaceId = await ipCmd.getDefaultDevice();
  const primaryIface = os.networkInterfaces()[primaryIfaceId];

  console.log('connecting...');
  await ddpclient.connect();
  console.log('upstream connected');

  // hook self-driving controller clients
  const puppetManager = new PuppetManager(ddpclient);

  const startT = +new Date;
  const registerBody = {
    // Node
    AgentVersion: packageJson.version,
    InternalAddresses: primaryIface.map(x => x.address),
    // LinuxNode
    SelfHostname: os.hostname(),
    OsRelease: await readOsRelease(),
    InitFlavor: hasSystemd ? 'systemd' : 'unknown',
    PrimaryMac: primaryIface[0].mac,
    UserInfo: os.userInfo(),
    HasWgKernelModule: await checkForKernelModule('wireguard'),
    SelfDrivingAvailable: await puppetManager.listSelfDrivables(),
  };
  const identMs = +new Date - startT;
  console.log('Built registration payload in', identMs, 'millis');

  const identity = await ddpclient.call('/Node/Register', registerBody);
  console.log('Registered with mesh controller as', identity);

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
