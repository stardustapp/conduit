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

(async () => {

  // establish websocket
  console.log('connecting to dustbox...');
  const dustClient = new DustClient(
    process.env.DUST_WS_URI || 'ws://dustbox.wg69.net');
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

  // TODO: set up timer to cull old ApiServers, offline their nodes, and update our LastSeen
  // TODO: call timer like 5s after startup

  async function manageApiLifecyles() {
    try {
      await apiServer.instance.cullZombies(recordManager);
      await apiServer.instance.markSeen();
    } finally {
      setTimeout(manageApiLifecyles, 60 * 1000)
    }
  }
  await apiServer.instance.cullZombies(recordManager);
  setTimeout(manageApiLifecyles, 30 * 1000);

  // load in the mesh state
  // const meshController = new MeshController(recordManager);

  // Load and set up self-driving controllers
  const controllerManager = new ControllerManager(recordManager, {
    AgentUpgrade: require('./controllers/AgentUpgrade.js').AgentUpgrade,
    ContainerNetwork: require('./controllers/ContainerNetwork.js').ContainerNetwork,
    PodMan: require('./controllers/PodMan.js').PodMan,
    WireGuard: require('./controllers/WireGuard.js').WireGuard,
  });

  // configure the API surface
  const ddpServer = new DDPServer();
  apiServer.instance.exposeApiSurface({ ddpServer, recordManager, controllerManager });
  ddpServer.listen(8080);

  while (true) {
    await sleepMs(5000);
  }

  console.log('disconnecting...');
  await dustClient.disconnect();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
