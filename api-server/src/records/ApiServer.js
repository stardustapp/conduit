exports.ApiServer = class ApiServer {
  constructor(selfHandle) {
    this.self = selfHandle;
  }

  exposeApiSurface({
    ddpServer,
    recordManager,
    controllerManager,
  }) {
    ddpServer.methods["/Node/Register"] =
      this.registerNode.bind(this, recordManager);
    ddpServer.methods["/Node/SyncActualState"] =
      this.syncActualState.bind(this, recordManager, controllerManager);

    ddpServer.publications["/Node/SelfDriving"] =
      controllerManager.publishSelfDriving.bind(controllerManager);
  }

  async cullZombies(recordManager) {
    const cutOffDate = new Date(new Date() - 2.5*60*1000); // couple minutes ago
    for (const apiServer of recordManager.findRecords('ApiServer')) {
      if (apiServer._recordId == this.self._recordId) continue;

      const {id, version, LastSeen} = apiServer.latestData;
      if (LastSeen >= cutOffDate) continue;

      console.log('Culling zombie', apiServer);
      await apiServer.hardDelete(version);
    }
  }

  markSeen() {
    return this.self.commitFields({
      LastSeen: new Date,
    });
  }

  async registerNode(recordManager, client, registration) {

    const record = recordManager.collection()
      .findRecord('LinuxNode', record =>
        record.PrimaryMac === metadata.PrimaryMac);

    let nodeId;
    if (record) {
      console.log('Identified', metadata.PrimaryMac, 'as LinuxNode', record.id);
      nodeId = await this.dustClient.updateRecord(record, metadata);
    } else {
      console.log('Creating LinuxNode for', metadata.PrimaryMac);
      nodeId = await this.dustClient.createRecord('LinuxNode', metadata);
    }

    // for (const iface of metadata.Interfaces) {
    //   await this.upsertInterface(nodeId, iface);
    // }

    if (!this.knownNodes.has(nodeId)) {
      console.log('JIT-creating LinuxNode instance for new NodeId', nodeRecord.id);
      const newObj = new LinuxNode(this, nodeId);
      this.knownNodes.set(nodeRecord.id, newObj);
    }
    const nodeObj = this.knownNodes.get(nodeId);
    this.connectedNodes.set(client, nodeObj);
  }

  async syncActualState(recordManager, controllerManager, client, actualState) {
    for (const stateKey in actualState) {
      const stateValue = actualState[stateKey];
      console.warn('TODO: received actual state', stateKey, stateValue);
    }
  }
}
