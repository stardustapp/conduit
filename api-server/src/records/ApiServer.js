exports.ApiServer = class ApiServer {
  constructor(selfHandle) {
    this.self = selfHandle;
    this.connectedNodes = new Map; // DDPServerClient -> RecordHandle
  }

  exposeApiSurface({
    ddpServer,
    recordManager,
    controllerManager,
  }) {
    ddpServer.methods["/Node/Register"] =
      this.registerNode.bind(this, recordManager);
    ddpServer.methods["/Node/SyncActual"] =
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
      TODO(`Unlink zombied nodes before hardDelete()ing the zombie ApiServer itself`);
      await apiServer.hardDelete(version);
    }
  }

  markSeen() {
    return this.self.commitFields({
      LastSeen: new Date,
    });
  }

  async registerNode(recordManager, client, registration) {
    // console.log('inbound reg:', registration)
    let nodeHandle = recordManager.findRecords('Node', record =>
        record.PrimaryMac === registration.PrimaryMac)[0];

    if (nodeHandle) {
      console.log('Identified', registration.PrimaryMac, 'as', nodeHandle);
      await nodeHandle.commitFields(registration);
    } else {
      nodeHandle = await this.recordManager.commitNew('LinuxNode', registration);
      console.log('Created LinuxNode', nodeHandle._id, 'for', registration.PrimaryMac);
    }

    // for (const iface of registration.Interfaces) {
    //   await this.upsertInterface(nodeHandle, iface);
    // }

    // this.knownNodes.set(nodeHandle._id, nodeHandle.instance);
    this.connectedNodes.set(client, nodeHandle);
  }

  async syncActualState(recordManager, controllerManager, client, stateKey, actualState) {
    const nodeHandle = this.connectedNodes.get(client);
    TODO(`received actual state for ${stateKey} from ${nodeHandle}`);
    await controllerManager.syncActualState(nodeHandle, stateKey, actualState);
  }
}
