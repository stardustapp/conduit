const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);

const SimpleDDP = require('simpleddp');
const ws = require('ws');
const process = require('process');

const ddpclient = new SimpleDDP({
  endpoint: process.env.DUST_WS_URI || "ws://stardustapp.run/websocket",
  SocketConstructor: ws,
  reconnectInterval: 5000
});

const {DDPServer} = require('./ddp-server');
const server = new DDPServer({
  methods: {

    async "/LinuxNode/identify"(metadata) {
      const record = ddpclient.collection('records')
        .filter(record => record.type === 'LinuxNode'
          && record.PrimaryMac === metadata.PrimaryMac)
        .fetch()[0];

      if (record) {
        console.log('Identified as LinuxNode', record.id);
        const _id = record.id;
        return await ddpclient.call('/records/commit', {_id, ...record, ...metadata});
      } else {
        console.log('Creating LinuxNode for', metadata);
        const result = await ddpclient.call('/records/commit', {
          packageId: 'conduit',
          type: 'LinuxNode',
          ...metadata,
        });
        console.log('Created LinuxNode', result.id);
        return result;
      }
    },

  },
});

ddpclient.on('disconnected', () => {
  console.warn('Disconnected from DDP! Bailing...');
  process.exit(5);
});

(async () => {

  console.log('connecting...');
  await ddpclient.connect();
  console.log('upstream connected');

  // await callDDP('login', [{resume: process.env.INSIDE_RESUME_TOKEN}]);

  // var observer = ddpclient.observe('records');
  // observer.added = function(id, newValue) {
  //   const doc = ddpclient.collections.records[id];
  //   console.log("[ADDED] to " + observer.name + ":  " + id, doc.type);
  //   // startBrowser(doc._id, doc.name);
  // };
  // observer.changed = function(id, oldFields, clearedFields, newFields) {
  //   console.log("[CHANGED] in " + observer.name + ":  " + id, {oldFields, clearedFields, newFields});
  //   //console.log("[CHANGED] old field values: ", oldFields);
  //   //console.log("[CHANGED] cleared fields: ", clearedFields);
  //   //console.log("[CHANGED] new fields: ", newFields);
  // };
  // observer.removed = function(id, oldValue) {
  //   console.log("[REMOVED] in " + observer.name + ":  " + id);
  //   //console.log("[REMOVED] previous value: ", oldValue);
  // };
  // //setTimeout(function() { observer.stop() }, 6000);

  // subscribe to all data
  const dataSub = ddpclient.subscribe('/dust/publication', 'conduit', 'FullData', {});
  await dataSub.ready();

  const records = ddpclient.collection('records').fetch();
  console.log('received', records.length, 'records');

  server.listen(8080);

  while (true) {
    await sleepMs(5000);
  }

  console.log('disconnecting...');
  await ddpclient.disconnect();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
