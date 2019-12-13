exports.ContainerNetwork = class ContainerNetworkController {
  constructor(recordManager) {
    this.recordManager = recordManager;
  }

  publishSelfDriving(nodeHandle, subscriber) {
    const {type} = nodeHandle.latestData;
    if (type !== 'LinuxNode') throw new Error(
      `TODO: ContainerNetwork can only publish to LinuxNode so far`);

    const cniCursor = this.recordManager
      .findRecordsRaw('ContainerNetwork', record =>
        record.NodeId === nodeHandle._id)
      .reactive();

    subscriber.informFields({asdf:34,confLists: cniCursor.data()});
    return cniCursor.onChange(() => {
      subscriber.informFields({confLists: cniCursor.data()});
    });
  }
}
