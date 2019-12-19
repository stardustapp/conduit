const cniFile = require('../files/etc.cni.js');

module.exports = class ContainerNetworkPuppet extends require('./_base.js') {
  async submitObservations() {
    const data = await cniFile.dumpAllNetworks();
    console.log(JSON.stringify(data));
    await this.syncActual(data);
    console.log('Reported', data.length, 'CNI networks');
  }

  onObservingStart() {
    return this.trySubmitObservations();
  }

  async onSelfDriving({confLists}) {
    const existingNets = new Set(await cniFile.listAllNetworks());
    for (const net of confLists) {
      existingNets.delete(net.ConfListName);
      await cniFile.writeNetwork(net);
    }
    for (const oldNet of Array.from(existingNets)) {
      await cniFile.deleteNetwork(oldNet);
    }
  }
}
