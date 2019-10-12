const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);
const exec = promisify(require('child_process').exec);

const DDPClient = require('ddp');
const url = require('url');
const datastore = url.parse('http://localhost:8080');
const ddpclient = new DDPClient({
  host: datastore.hostname,
  port: datastore.port || (datastore.protocol === 'https:' ? 443 : 80),
  ssl: datastore.protocol === 'https:',
});

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

(async () => {

  console.log('connecting...');
  const connectDDP = promisify(ddpclient.connect.bind(ddpclient));
  await connectDDP();
  console.log('upstream connected');

  ddpclient.observe("interfaces");

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

  const callDDP = promisify(ddpclient.call.bind(ddpclient));
  const identity = await callDDP('/LinuxNode/identify', [{
    SelfHostname: os.hostname(),
    OsRelease: osRelease,
    InitFlavor: hasSystemd ? 'systemd' : 'unknown',
    PrimaryMac: primaryIface[0].mac,
    UserInfo: os.userInfo(),
    HasKernelModule: hasKernelModule,
  }]);
  console.log({identity});

  var observer = ddpclient.observe('records');
  observer.added = function(id, newValue) {
    const doc = ddpclient.collections.records[id];
    console.log("[ADDED] to " + observer.name + ":  " + id, doc);
    // startBrowser(doc._id, doc.name);
  };
  observer.changed = function(id, oldFields, clearedFields, newFields) {
    console.log("[CHANGED] in " + observer.name + ":  " + id, newFields);
    //console.log("[CHANGED] old field values: ", oldFields);
    //console.log("[CHANGED] cleared fields: ", clearedFields);
    //console.log("[CHANGED] new fields: ", newFields);
  };
  observer.removed = function(id, oldValue) {
    console.log("[REMOVED] in " + observer.name + ":  " + id);
    //console.log("[REMOVED] previous value: ", oldValue);
  };
  //setTimeout(function() { observer.stop() }, 6000);

  // subscribe to all data
  const subscribeDDP = promisify(ddpclient.subscribe.bind(ddpclient));
  await subscribeDDP('/LinuxNode/config', [identity.id]);

  // console.log('received', Object.keys(ddpclient.collections.records).length, 'records');

  console.log('Sleeping...');
  while (true) {
    await sleepMs(60 * 1000);
  }

  console.log('disconnecting...');
  const closeDDP = promisify(ddpclient.close.bind(ddpclient));
  await closeDDP();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
