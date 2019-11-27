const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);
const process = require('process');

const {DustClient} = require('./dust-client');
const {MeshController} = require('./mesh-controller');
const {DDPServer} = require('./ddp-server');

(async () => {

  const dustClient = new DustClient(
    process.env.DUST_WS_URI || 'ws://dustbox.wg69.net');

  console.log('connecting...');
  await dustClient.connect();
  console.log('upstream connected');

  // await callDDP('login', [{resume: process.env.INSIDE_RESUME_TOKEN}]);

  // subscribe to all data
  const dataSub = dustClient.subscribe('FullData');
  await dataSub.ready();

  const records = dustClient.recordCollection.fetch();
  console.log('received', records.length, 'records from dustbox');
  // console.log(records);

  // load in the mesh state
  const meshController = new MeshController(dustClient);

  // set up the API surface
  const server = new DDPServer();
  server.methods["/LinuxNode/Register"] =
    meshController.registerLinuxNode.bind(meshController);
  server.methods["/LinuxNode/Sync/NetDevice"] =
    meshController.syncNetDevices.bind(meshController);
  server.publications["/LinuxNode/SelfDriving"] =
    meshController.publishLinuxNode.bind(meshController);

  server.listen(8080);

  while (true) {
    await sleepMs(5000);
  }

  console.log('disconnecting...');
  await dustClient.disconnect();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
