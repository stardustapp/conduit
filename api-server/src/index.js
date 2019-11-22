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
        console.log('Identified', metadata.PrimaryMac, 'as LinuxNode', record.id);
      } else {
        console.log('Creating LinuxNode for', metadata.PrimaryMac);
      }

      const newRecord = record
        ? { _id: record.id, ...record, ...metadata }
        : { packageId: 'conduit', type: 'LinuxNode', ...metadata };
      const result = await ddpclient.call('/records/commit', newRecord);

      console.log('Committed LinuxNode', result.id);

      for (const ifaceId in metadata.Interfaces) {
        const iface = metadata.Interfaces[ifaceId];
        await upsertInterface(result.id, ifaceId, iface);
      }

      return result;
    },

  },
});

async function upsertInterface(nodeId, ifaceName, iface) {
  console.log('Matching iface', ifaceName);

  const allocations = iface.Addresses.map(addr => {
    const [base, preLen] = addr.split('/');
    const allocMatch = ddpclient.collection('records')
      .filter(record => record.type === 'Allocation'
        && record.BaseAddress === base
        && record.PrefixLength === parseInt(preLen))
      .fetch()[0];
    return allocMatch ? allocMatch.id : addr;
  });
  console.log('allocations', allocations)

  const directMatch = ddpclient.collection('records')
    .filter(record => record.type === 'Interface'
      && record.NodeId === nodeId
      && record.InterfaceName === ifaceName)
    .fetch()[0];

  const keyMatch = ddpclient.collection('records')
    .filter(record => record.type === 'Interface'
      && record.PublicKey === iface.PublicKey)
    .fetch()[0];

  let interfaceId;
  if (directMatch) {
    // TODO: update fields
    interfaceId = directMatch.id;
  } else if (keyMatch) {
    throw new Error(`TODO 2`);
  } else {
    const result = await ddpclient.call('/records/commit', {
      packageId: 'conduit',
      type: 'Interface',
      NodeId: nodeId,
      InterfaceName: ifaceName,
      PublicKey: iface.PublicKey,
      // InternetEndpoint:
      ListenPort: iface.ListenPort,
      DirectAllocationIds: allocations,
    });
    interfaceId = result.id;
  }
  if (!interfaceId) return;

  for (const peer of iface.Peers) {
    console.log('visiting peer', peer);
    const peerMatch = ddpclient.collection('records')
      .filter(record => record.type === 'Interface'
        && record.PublicKey === peer.PublicKey)
      .fetch()[0];

    let peerIfaceId;
    if (peerMatch) {
      // TODO: update InternetEndpoint using Endpoint?
      peerIfaceId = peerMatch.id;
    } else {
      console.log('Creating Interface for foreign peer', peer.PublicKey);
      const result = await ddpclient.call('/records/commit', {
        packageId: 'conduit',
        type: 'Interface',
        PublicKey: peer.PublicKey,
        InternetEndpoint: peer.Endpoint,
        // LatestHandshake: peer.LatestHandshake,
        ListenPort: peer.Endpoint ? parseInt(peer.Endpoint.split(':')[1]) : null,
        // DirectAllocationIds: allocations,
      });
      peerIfaceId = result.id;
    }

    const tunnelMatch = ddpclient.collection('records')
      .filter(record => record.type === 'Tunnel'
        && record.InterfaceIds.includes(interfaceId)
        && record.InterfaceIds.includes(peerIfaceId))
      .fetch()[0];
    if (tunnelMatch) {
      // TODO: update LatestHandshake
    } else {
      console.log('Creating Tunnel to peer', peer.PublicKey);
      await ddpclient.call('/records/commit', {
        packageId: 'conduit',
        type: 'Tunnel',
        InterfaceIds: [ interfaceId, peerIfaceId ],
        LatestHandshake: peer.LatestHandshake,
      });
    }
  }
}

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
