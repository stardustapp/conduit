exports.LinuxNode = class LinuxNode {
  // constructor(meshController, nodeId) {
  //   this.meshController = meshController;
  //   this.nodeId = nodeId;
  //   if (!nodeId) throw new Error(`nodeId is required`);
  // }
  //
  // applyConfig(nodeRecord) {
  //   this.nodeRecord = nodeRecord;
  //   console.log('TODO: refreshed LinuxNode config', nodeRecord.id);
  //   console.log(nodeRecord)
  //
  //   const records = this.meshController.findNodeRelevantRecords(nodeRecord.id);
  //   console.log('Found', records.length, 'node records');
  // }
  //
  // link() {
  //   console.log('TODO: LinuxNode#link()');
  // }

  async attachClient(client) {
    await this.meshController.updateLinuxNode(this.nodeId, {
      OnlineToken: client.sessionId.toString(),
      OnlineSince: new Date(),
    });
    this.liveClient = client;
    // TODO: start issuing self-driving?
  }
}
