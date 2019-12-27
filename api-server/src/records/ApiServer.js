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
      this.publishSelfDriving.bind(this, controllerManager);
  }

  async cullZombies(recordManager) {
    const cutOffDate = new Date(new Date() - 2.5*60*1000); // couple minutes ago
    for (const apiServer of recordManager.findRecords('ApiServer')) {
      if (apiServer._recordId == this.self._recordId) continue;

      const {id, version, LastSeen} = apiServer.latestData;
      if (LastSeen >= cutOffDate) continue;

      console.log('Culling zombie', apiServer);
      // look for nodes that were still connected to the zombie
      for (const nodeHandle of recordManager.findRecords('Node')) {
        if (nodeHandle.latestData.ApiServerId !== apiServer._id) continue;

        // try marking each node, but don't wait for it
        console.log('Marking node', nodeHandle, 'as offline (zombied)');
        nodeHandle.commitFields({
          ApiServerId: null,
          OnlineToken: null,
          OnlineSince: null,
        }).catch(err => {
          console.log('WARN: Failed to mark node', nodeHandle, 'offline.', err.message);
        })
      }

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
      nodeHandle = await recordManager.commitNew('LinuxNode', registration);
      console.log('Created LinuxNode', nodeHandle._id, 'for', registration.PrimaryMac);
    }

    // this.knownNodes.set(nodeHandle._id, nodeHandle.instance);
    this.connectedNodes.set(client, nodeHandle);
    return nodeHandle._id;
  }

  async syncActualState(recordManager, controllerManager, client, stateKey, actualState) {
    const nodeHandle = this.connectedNodes.get(client);
    return await controllerManager.syncActualState(nodeHandle, stateKey, actualState);
  }

  async publishSelfDriving(controllerManager, client) {
    const nodeHandle = this.connectedNodes.get(client);
    await controllerManager.publishSelfDriving(nodeHandle, client);

    const onlineToken = client.sessionId.toString();
    await nodeHandle.commitFields({
      ApiServerId: this.self._id,
      OnlineToken: onlineToken,
      OnlineSince: new Date(),
    });

    client.addCloser(async () => {
      // check if we're still the 'live' connection
      if (nodeHandle.latestData.OnlineToken === onlineToken) {
        console.log('Marking node', nodeHandle, 'as offline (closed)');
        await nodeHandle.commitFields({
          ApiServerId: null,
          OnlineToken: null,
          OnlineSince: null,
        });
      }
    });
  }
}
