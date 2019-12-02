exports.ClassType = class DustClassType {
  constructor(name, wireName, base, fields) {
    this.name = name;
    this.wireName = wireName;
    this.base = base;
    this.fields = fields;
    this.childTypes = new Array;
    this.allTypeNames = new Set([wireName]);

    if (base) {
      base.registerDescendent(this, wireName);
    } else if (!name.startsWith('core:')) {
      throw new Error(`Non-core DustClassTypes must have a base`);
    }
  }

  registerDescendent(child, wireName, isDirect=true) {
    this.allTypeNames.add(wireName);
    if (this.base) {
      this.base.registerDescendent(child, wireName, false);
    }
    if (isDirect) {
      this.childTypes.push(child);
    }
  }

  installFields(record) {
    // TODO('install getters and setters for '+this.name);
  }
}
