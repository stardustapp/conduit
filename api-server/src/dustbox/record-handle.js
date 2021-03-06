const util = require('util');
const EJSON = require('ejson');

// Does not store actual data. Just knows the identity of a record.
exports.RecordHandle = class DustRecordHandle {
  constructor(recordManager, classType, recordId) {
    if (!classType || !recordId) throw new Error(
      `classType and recordId are required for RecordHandle()`);

    this._recordManager = recordManager;
    this._classType = classType;
    this._recordId = recordId;

    this._classType.installFields(this);
    Object.freeze(this);
  }
  toString() {
    return `<DustRecord type="${this._classType.name}" id="${this._recordId}" />`;
  }
  [util.inspect.custom](depth, opts) {
    return this.toString();
  }

  get _id() {
    return this._recordId;
  }
  get latestData() {
    const data = this._recordManager
      .fetchRecordData(this._recordId);
    if (data.type !== this._classType.wireName) throw new Error(
      `Type mismatch: expected ${this}, received record of type ${data.type}`);
    return data;
  }
  // TODO('return snapshot with accessors');
  get instance() {
    const {recordInstances} = this._recordManager;
    if (recordInstances.has(this._recordId)) {
      return recordInstances.get(this._recordId);
    }

    const {wireName} = this._classType;
    if (wireName in this._recordManager.recordImpls) {
      const instance = new this._recordManager.recordImpls[wireName](this);
      recordInstances.set(this._recordId, instance);
      return instance;
    }

    throw new Error(`Record type ${wireName} has no instance implementation`);
  }
  
  reactiveCursor() {
    return this._recordManager
      .dustClient.recordCollection
      .filter(record => record.id === this._recordId
          && record.type === this._classType.wireName)
      .reactive({
        limit: 1,
      }).one();
  }

  commitFields(newFields) {
    const snapshot = this.latestData;
    const changedFields = new Array;
    for (const key in newFields) {
      if (EJSON.stringify(snapshot[key]) !== EJSON.stringify(newFields[key])) {
        console.log(key, snapshot[key], newFields[key])
        changedFields.push(key);
      }
    }
    if (changedFields.length === 0) return;
    console.log('Updating fields', changedFields, 'on', this._id);

    return this._recordManager
      .commitMutation(this._recordId, record => {
        return {...record, ...newFields};
      });
  }

  hardDelete(version=null) {
    return this._recordManager.hardDelete(
      this._recordId, this._classType.wireName, this.version);
  }
}
