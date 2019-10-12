const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);

const url = require('url');
const process = require('process');

const DDPClient = require('ddp');
const datastore = url.parse(process.env.DUST_URI || 'http://stardustapp.run');
const ddpclient = new DDPClient({
  host: datastore.hostname,
  port: datastore.port || (datastore.protocol === 'https:' ? 443 : 80),
  ssl: datastore.protocol === 'https:',
});

const callDDP = promisify(ddpclient.call.bind(ddpclient));

const {DDPServer} = require('./ddp-server');
const server = new DDPServer({
  methods: {
    async "/LinuxNode/identify"(metadata) {
      for (const rId in (ddpclient.collections.records || {})) {
        const record = ddpclient.collections.records[rId];
        if (record.PrimaryMac === metadata.PrimaryMac) {
          console.log('Identified LinuxNode', record._id);
          const newRecord = {...record, ...metadata};
          return await callDDP('/records/commit', [newRecord]);
        }
      }

      console.log('Creating LinuxNode for', metadata);
      const result = await callDDP('/records/commit', [{
        packageId: 'conduit',
        type: 'LinuxNode',
        ...metadata,
      }]);
      console.log('Created LinuxNode', result.id);
      return result;
    },
  },
});

(async () => {

  console.log('connecting...');
  const connectDDP = promisify(ddpclient.connect.bind(ddpclient));
  await connectDDP();
  console.log('upstream connected');

  ddpclient.observe("mapthings");
  ddpclient.observe("people");

  // await callDDP('login', [{resume: process.env.INSIDE_RESUME_TOKEN}]);

  var observer = ddpclient.observe('records');
  observer.added = function(id, newValue) {
    const doc = ddpclient.collections.records[id];
    console.log("[ADDED] to " + observer.name + ":  " + id, doc.type);
    // startBrowser(doc._id, doc.name);
  };
  observer.changed = function(id, oldFields, clearedFields, newFields) {
    console.log("[CHANGED] in " + observer.name + ":  " + id, {oldFields, clearedFields, newFields});
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
  await subscribeDDP('/dust/publication', ['conduit', 'FullData', {}]);

  // console.log('received', Object.keys(ddpclient.collections.records).length, 'records');

  server.listen(8080);

  while (true) {
    await sleepMs(5000);
  }

  console.log('disconnecting...');
  const closeDDP = promisify(ddpclient.close.bind(ddpclient));
  await closeDDP();

})().catch(err => {
  console.log(err.stack || err);
  process.exit(1);
});
