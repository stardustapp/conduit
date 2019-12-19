const podmanCmd = require('../commands/podman.js');
const REPORTING_CONFIGS = true; // TODO

module.exports = class PodManPuppet extends require('./_base.js') {
  constructor(manager, reactiveConfig, syncActual) {
    super(manager, reactiveConfig, syncActual);

    // Name => ID maps
    this.knownPods = new Map;
    this.podStates = new Map;
    // this.knownCons = new Map;
    // this.conStates = new Map;

    const podColl = manager.ddpClient
      .collection('PodMan pods');
    console.log('TODO: initial pod records:', podColl.fetch());
    podColl.onChange((...args) => {
        console.log('TODO: pod record change', args);
      });
  }

  async submitObservations() {
    const changes = new Array;

    const extraPods = new Set(this.knownPods.keys());
    for (const {PodName, Status} of await podmanCmd.dumpPods()) {
      extraPods.delete(PodName);
      if (REPORTING_CONFIGS && Status.Id !== this.knownPods.get(PodName)) {
        const Config = await podmanCmd.inspectPodConf(Status.Id);
        console.log(`pod ${PodName} was replaced with`, Config);
        changes.push({Cmd: 'pod identity', PodName, Status, Config});
      } else if (Status.State !== this.podStates.get(PodName)) {
        changes.push({Cmd: 'pod status', PodName, Status});
      } else {
        console.log(`pod ${PodName} up to date`);
      }
    }

    for (const pod of extraPods) {
      changes.push({Cmd: 'pod rm', pod});
    }

    // console.log('PodMan pod changes:', changes);
    await this.syncActual({changes});
    console.log('Reported', changes.length, 'pod changes');
  }

  shouldObserveMode(mode) {
    return ['Observing', 'SelfDriving'].includes(mode);
  }
  onObservingStart() {
    podmanCmd.getEventStream().on('pod', event => {
      console.log('PodManPuppet pod event:', event);
    });
    return this.trySubmitObservations();
  }

  // async onSelfDriving({confLists}) {
  //   const existingNets = new Set(await cniFile.listAllNetworks());
  //   for (const net of confLists) {
  //     existingNets.delete(net.ConfListName);
  //     await cniFile.writeNetwork(net);
  //   }
  //   for (const oldNet of Array.from(existingNets)) {
  //     await cniFile.deleteNetwork(oldNet);
  //   }
  // }
}
