// TODO: support custom impls?
const EJSON = require('ejson');
EJSON.addType('Astronomy', json => {
  // json.class, json.values
  const {packageId, scope, ...data} = EJSON.parse(json.values);
  return data;
});

const {RecordHandle} = require('./record-handle.js');
const {ClassCompiler} = require('./class-compiler.js');

function readTypeName(typeName) {
  return typeName.includes(':')
    ? typeName : `my:${typeName}`;
}

exports.RecordManager = class RecordManager {
  constructor(dustClient, recordImpls={}) {
    this.dustClient = dustClient;
    this.recordInstances = new Map; // record id -> custom class instance
    this.recordImpls = recordImpls; // local name -> JS constructor

    const compiler = new ClassCompiler();
    compiler.registerCore();

    // Bring in custom types
    const customRecords = this
      .dustClient.resourceCollection
      .filter(record => record.type === 'CustomRecord');
    for (const rawType of customRecords.fetch()) {
      compiler.registerCustomRecord(rawType);
    }

    this.typeMap = compiler.finish();

    customRecords.onChange( ({prev,next}) => {
      console.warn('TODO: A CustomRecord was updated!');
      process.exit(9);
    });
  }

  fetchRecordData(recordId) {
    const list = this.dustClient.recordCollection
      .filter(record => record.id === recordId)
      .fetch();
    if (list.length < 1) throw new Error(
      `Failed to find record data for ID ${recordId}`);
    return list[0];
  }

  findRecordsRaw(typeName, selector=()=>true) {
    const classType = this.getClassType(typeName);
    // console.log(classType, selector);
    return this
      .dustClient.recordCollection
      .filter(record => classType
        .allTypeNames.has(record.type)
        && selector(record));
  }

  findRecords(typeName, selector=()=>true) {
    return this
      .findRecordsRaw(typeName, selector)
      .fetch().map(({type, id}) =>
        new RecordHandle(this, this.getClassType(type), id));
  }

  async commitMutation(recordId, mutatorCb, maxTries=3) {
    let triesLeft = maxTries;

    while (triesLeft >= 1) {
      const newRecord = mutatorCb(this.fetchRecordData(recordId));
      triesLeft--;

      try {
        const result = await this.dustClient.updateRecord(newRecord);
        return result.version;
      } catch (err) {
        console.log('commitMutation() on record', recordId, 'failed',
            'with', triesLeft, 'retries left.', err);
      }
      TODO('sleep a second, for safety');
    }
    throw new Error(`Ran out of retries mutating record ${recordId}`);
  }
  async commitNew(typeName, fieldData) {
    const classType = this.getClassType(typeName);
    const result = await this.dustClient.createRecord(classType.wireName, fieldData);
    // TODO('use custom impls if defined')
    // return classType.createWrapper(this, recordId);
    return new RecordHandle(this, classType, result.id);
  }

  hardDelete(id, type, version=null) {
    if (version === null) {
      return this.dustClient.hardDeleteRecord(this.fetchRecordData(id));
    } else {
      return this.dustClient.hardDeleteRecord({id, type, version});
    }
  }

  getClassType(typeName) {
    let fullName = readTypeName(typeName);
    if (!this.typeMap.has(fullName)) throw new Error(
      `DUST Resource '${typeName}' failed to resolve`);
    return this.typeMap.get(fullName);
  }
}
