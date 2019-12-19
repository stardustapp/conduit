exports.PodMan = class PodManController {
  constructor(recordManager) {
    this.recordManager = recordManager;
  }

  publishContext(nodeHandle, ddpClient) {
    const {type} = nodeHandle.latestData;
    if (type !== 'LinuxNode') throw new Error(
      `TODO: PodMan can only publish to LinuxNode so far`);

    const podsCursor = this.recordManager
      .findRecordsRaw('PodManPod', record =>
        record.NodeId === nodeHandle._id);

    // TODO: send initial batch
    // console.log('initial pod data', podsCursor.fetch());
    for (const pod of podsCursor.fetch()) {
      const {id, _isNew, type, packageId, scope, ...fields} = pod;
      ddpClient.sendMessage({
        collection: 'PodMan pods',
        msg: 'added',
        id, fields,
      });
    }

    return podsCursor.onChange(change => {
      // console.log('PodMan Pod change!', change);
      if (change.prev && change.next) {
        ddpClient.sendMessage({
          collection: 'PodMan pods',
          msg: 'changed',
          id: change.prev.id,
          fields: change.fieldsChanged,
          cleared: change.fieldsRemoved,
        });
      } else if (change.prev) {
        ddpClient.sendMessage({
          collection: 'PodMan pods',
          msg: 'removed',
          id: change.prev.id,
        });
      } else if (change.next) {
        ddpClient.sendMessage({
          collection: 'PodMan pods',
          msg: 'added',
          id: change.prev.id,
          fields: change.fieldsChanged,
        });
      }
    });
  }
}
