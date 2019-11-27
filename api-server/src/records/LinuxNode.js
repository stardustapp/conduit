exports.LinuxNode = class LinuxNode {
  constructor(meshController, nodeId) {
    this.meshController = meshController;
    this.nodeId = nodeId;
  }

  applyConfig(nodeRecord) {
    this.nodeRecord = nodeRecord;
    console.log('TODO: refreshed LinuxNode config', nodeRecord.id);
    console.log(nodeRecord)

    const records = this.meshController.findNodeRelevantRecords(nodeRecord.id);
    console.log('Found', records.length, 'node records');
  }

  link() {
    console.log('TODO: LinuxNode#link()');
  }
}
