const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);
const process = require('process');

global.TODO = function (msg) {
  console.warn('--> TODO:', msg);
}

const {DustClient} = require('./dustbox/client.js');
// const {MeshController} = require('./mesh-controller.js');
const {RecordManager} = require('./dustbox/record-manager.js');
const {ControllerManager} = require('./controller-manager.js');
const {DDPServer} = require('./ddp-server.js');

// TODO: dummy by default, enable with ENV
const {MetricsSubmission} = require('./metrics-gcloud.js');
const metrics = new MetricsSubmission({
  location: 'us-central1',
  namespace: 'conduit',
});

(async () => {

  // establish websocket
  console.log('connecting to dustbox...');
  const dustClient = new DustClient(
    process.env.DUST_WS_URI || 'ws://dustbox.wg69.net', 'conduit');
  await dustClient.connect();
  console.log('upstream connected');

  // authenticate maybe?
  // await callDDP('login', [{resume: process.env.INSIDE_RESUME_TOKEN}]);

  // download the dust source resources (for schema) (TODO?: limit in scope)
  const runtimeSub = dustClient.subscribeAppRuntime();
  await runtimeSub.ready();

  // compile the dust schema and register instance constructors
  const recordManager = new RecordManager(dustClient, {
    Allocation: require('./records/Allocation.js').Allocation,
    ApiServer: require('./records/ApiServer.js').ApiServer,
    LinuxNode: require('./records/LinuxNode.js').LinuxNode,
  });

  // download all data records (TODO: limit in scope)
  const dataSub = dustClient.subscribe('FullData');
  await dataSub.ready();

  // log our amazing progress :)
  const records = dustClient.recordCollection.fetch();
  console.log('downloaded', records.length, 'records from dustbox');
  // console.log(records);

  // create ApiServer record for self
  // used to associate our lifecycle with individual records
  const apiServer = await recordManager.commitNew('ApiServer', {
    LaunchDate: new Date,
    LastSeen: new Date,
    HostName: require('os').hostname(),
  });

  await apiServer.instance.cullZombies(recordManager);
  setInterval(async function manageApiLifecyles() {
    try {
      await apiServer.instance.markSeen();
      await apiServer.instance.cullZombies(recordManager);
    } catch (err) {
      console.log('manageApiLifecyles background crash:');
      console.log(err.stack);
    }
  }, 60 * 1000);

  // load in the mesh state
  // const meshController = new MeshController(recordManager);

  // Load and set up self-driving controllers
  const controllerManager = new ControllerManager(dustClient, recordManager, metrics, {
    AgentUpgrade: require('./controllers/AgentUpgrade.js').AgentUpgrade,
    ContainerNetwork: require('./controllers/ContainerNetwork.js').ContainerNetwork,
    NetDevice: require('./controllers/NetDevice.js').NetDevice,
    PodMan: require('./controllers/PodMan.js').PodMan,
    SmartDrive: require('./controllers/SmartDrive.js').SmartDrive,
    WireGuard: require('./controllers/WireGuard.js').WireGuard,
  });

  // configure the API surface
  const ddpServer = new DDPServer();
  apiServer.instance.exposeApiSurface({ ddpServer, recordManager, controllerManager });

  // let's friggin goooo!!
  const address = await ddpServer.listen(8080);
  console.log('Listening @', address);
  console.log();
  while (true) {
    await sleepMs(15000);
  }

  // TODO: proceed to a clean shutdown on signal..
  console.log('disconnecting...');
  await dustClient.disconnect();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
