const {ClassType} = require('./class-type.js');

function readTypeName(typeName) {
  return typeName.includes(':')
    ? typeName : `my:${typeName}`;
}

exports.ClassCompiler = class ClassCompiler {
  constructor() {
    this.allTypes = new Map; // map[full name]ClassType
    this.baseChilds = new Map; // map[base full name][]child full name
    this.readyBases = new Array; // []full name
  }

  registerCore() {
    this.registerClassType('core:Record', 'Record', null, [{
      key      : 'version',
      type     : 'core:number',
      isList   : false,
      optional : false,
      immutable: false,
      default  : null,
    }]);
    this.registerClassType('core:Class', null, null, []);
  }

  registerClassType(fullName, wireName, baseType, fields) {
    if (this.allTypes.has(fullName)) throw new Error(
      `registerClassType() tried re-registering ${fullName}`);

    // console.log('registering type', fullName);
    this.allTypes.set(fullName, new ClassType(fullName, wireName, baseType, fields));

    // check if anything is waiting for us
    if (this.baseChilds.has(fullName)) {
      // console.log('recording base', fullName, 'as ready');
      this.readyBases.push(fullName);
    }
  }
  registerCustomRecord(customRecordRecord) {
    const {base, name, fields} = customRecordRecord;
    const fullBaseName = readTypeName(base);
    const fullName = readTypeName(name);

    if (this.allTypes.has(fullBaseName)) {
      // run now if readin
      this.registerClassType(fullName, name, this.allTypes.get(fullBaseName), fields);
    } else {
      // queue for when base is ready
      if (!this.baseChilds.has(fullBaseName)) {
        this.baseChilds.set(fullBaseName, new Set);
      }
      console.log('Queueing', fullName, 'to build after', fullBaseName);
      this.baseChilds.get(fullBaseName).add(customRecordRecord);
    }
  }

  finish() {
    while (this.readyBases.length > 0) {
      const baseName = this.readyBases.shift();
      const base = this.allTypes.get(baseName);

      // console.log('Finishing base', baseName, '...');
      for (const child of this.baseChilds.get(baseName)) {
        const childName = readTypeName(child.name);
        this.registerClassType(childName, child.name, base, child.fields);
      }
      this.baseChilds.delete(baseName);
    }

    const pendingBases = Array.from(this.baseChilds.keys());
    if (pendingBases.length > 0) throw new Error(
      `ClassCompiler can't finish(), still need bases ${pendingBases.join(', ')}`);

    console.log('Finished registering', Array.from(this.allTypes.keys()).length, 'types!');
    return this.allTypes;
  }
}
