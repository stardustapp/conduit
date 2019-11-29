const SimpleDDP = require('simpleddp');
const ws = require('ws');

exports.DustClient = class DustClient {
  constructor(dustUrl, packageId="conduit") {
    this.wsUrl = dustUrl+'/websocket';
    this.packageId = packageId;

    console.log('Server endpoint:', this.wsUrl)
    this.ddpclient = new SimpleDDP({
      endpoint: this.wsUrl,
      SocketConstructor: ws,
      reconnectInterval: 5000,
    });

    this.connect = this.ddpclient.connect.bind(this.ddpclient);
    this.disconnect = this.ddpclient.disconnect.bind(this.ddpclient);

    this.ddpclient.on('connected', () => {
      console.warn('Connected to DDP!');
    });
    this.ddpclient.on('disconnected', () => {
      console.warn('Disconnected from DDP! Bailing...');
      process.exit(5);
    });
    this.ddpclient.on('error', (err) => {
      console.warn('DDP error:', err);
    });
  }

  // TODO: subscribe to/follow package-defined subtyping

  findRecord(typeName, selector) {
    const record = this.ddpclient
      .collection('records')
      .filter(record => record.type === typeName && selector(record))
      .fetch()[0];
    if (record) {
      console.log('found record', record.id, 'of type', record.type);
      return record;
    } else {
      console.log('no', typeName, 'record matched :(');
    }
    return null;
  }

  subscribeAppRuntime() {
    return this.ddpclient.subscribe('/app-runtime', this.packageId);
  }
  get resourceCollection() {
    return this.ddpclient.collection('resources');
  }

  async commitRecord(newRev) {
    const err = new Error(`DDP commitRecord rejected`);
    try {
      const result = await this.ddpclient.call('/records/commit', newRev);
      console.log('Committed', newRev.type, result.id);
      return result;

    } catch (fail) {
      if (!('errorType' in fail)) throw fail;
      console.log('While committing:', newRev);
      err.message = fail.message;
      err.payload = fail;
      throw err;
    }
  }
  subscribe(name, arg={}) {
    return this.ddpclient.subscribe('/dust/publication', this.packageId, name, arg);
  }
  get recordCollection() {
    return this.ddpclient.collection('records');
  }

  createRecord(type, fields) {
    return this.commitRecord({ packageId: this.packageId, type, ...fields });
  }
  updateRecord(newRecord) {
    if (!newRecord.id || !newRecord.version) throw new Error(
      `updateRecord() only accepts full record snapshots with requested changes included`);
    return this.commitRecord({ _id: newRecord.id, ...newRecord });
  }
  hardDeleteRecord({id, type, version}) {
    if (!id || !version) throw new Error(
      `hardDeleteRecord() needs ID and Version`);
    return this.ddpclient.call('/records/hardDelete', {
      _id: id, type, version,
      packageId: this.packageId,
    });
  }
}
