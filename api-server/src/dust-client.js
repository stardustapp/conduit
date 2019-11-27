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

  async commitRecord(newRev) {
    const result = await this.ddpclient.call('/records/commit', newRev);
    console.log('Committed', newRev.type, result.id);
    return result.id;
  }
  subscribe(name, arg={}) {
    return this.ddpclient.subscribe('/dust/publication', this.packageId, name, arg);
  }
  get recordCollection() {
    return this.ddpclient.collection('records');
  }

  updateRecord(record, newFields={}) {
    return this.commitRecord({ _id: record.id, ...record, ...newFields });
  }
  createRecord(type, fields) {
    return this.commitRecord({ packageId: this.packageId, type, ...fields });
  }
}
