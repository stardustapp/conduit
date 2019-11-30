exports.NetDevice = class NetDeviceController {
  constructor(recordManager) {
    this.recordManager = recordManager;
  }

  async syncActualState(nodeHandle, actualState) {
    const knownDevices = this.recordManager
      .findRecords('NetDevice', record =>
        record.NodeId === nodeHandle._id);

    const existingDevs = new Map;
    const extraDevs = new Set;
    for (const knownDev of knownDevices) {
      const {DeviceName} = knownDev.latestData;
      if (existingDevs.has(DeviceName)) {
        console.log('WARN: found duplicated NetDevice somehow?', knownDev);
        extraDevs.add(knownDev);
      } else {
        existingDevs.set(DeviceName, knownDev);
      }
    }

    for (const iface of actualState) {
      const {DeviceName, LinkType, Addresses} = iface;
      console.log('Node', nodeHandle, 'offered', LinkType, 'interface', DeviceName);

      if (existingDevs.has(DeviceName)) {
        const existingDev = existingDevs.get(DeviceName);
        existingDevs.delete(DeviceName);
        await existingDev.commitFields(iface);

      } else {
        const newDev = await this.recordManager
          .commitNew('NetDevice', {
            NodeId: nodeHandle._id,
            ...iface,
          });
        console.log('Node', nodeHandle, 'created', newDev, 'for interface', DeviceName);
      }
    }

    for (const [devName, devHandle] of existingDevs) {
      // console.log('extra dev', extraDev);
      extraDevs.add(devHandle);
    }

    for (const goneDev of extraDevs) {
      await goneDev.hardDelete();
    }
    console.log('Completed NetDevice actual sync');
  }
}
