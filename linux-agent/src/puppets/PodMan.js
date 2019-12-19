const podmanCmd = require('../commands/podman.js');
const REPORTING_CONFIGS = true; // TODO

module.exports = class PodManPuppet extends require('./_base.js') {
  async canSelfDrive() {
    return await podmanCmd.test();
  }

  constructor(manager, reactiveConfig, syncActual) {
    super(manager, reactiveConfig, syncActual);

    // Name => doc maps
    this.knownPods = new Map;
    // this.knownCons = new Map;

    const podColl = manager.ddpClient
      .collection('PodMan pods');
    console.log('TODO: initial pod records:', podColl.fetch());
    podColl.onChange(({changed, added, removed}) => {
      switch (true) {
        case !!added:
          console.log('Server reported new pod', added.PodName);
          this.knownPods.set(added.PodName, added);
          break;
        case !!changed:
          console.log('Server reported changed pod', changed.next.PodName);
          this.knownPods.set(changed.next.PodName, changed.next);
          break;
        default:
          console.log('Server reported deleted pod', removed.PodName);
          this.knownPods.delete(removed.PodName);
          break;
      }
    });
  }

  async submitObservations() {
    const changes = new Array;

    const extraPods = new Set(this.knownPods.keys());
    for (const {PodName, Status} of await podmanCmd.dumpPods()) {
      extraPods.delete(PodName);
      const knownStatus = (this.knownPods.get(PodName) || {}).Status || {};
      // console.log(PodName, Status, knownStatus);
      if (REPORTING_CONFIGS && Status.Id !== knownStatus.Id) {
        const Config = await podmanCmd.inspectPodConf(Status.Id);
        console.log(`pod ${PodName} was replaced with`, Config);
        changes.push({Cmd: 'pod identity', PodName, Status, Config});
      } else if (Status.State !== knownStatus.State) {
        changes.push({Cmd: 'pod status', PodName, Status});
      } else {
        console.log(`pod ${PodName} up to date`);
      }
    }

    for (const pod of extraPods) {
      changes.push({Cmd: 'pod rm', PodName: pod});
    }

    // console.log('PodMan pod changes:', changes);
    await this.syncActual({changes});
    console.log('Reported', changes.length, 'pod changes');
  }

  shouldObserveMode(mode) {
    return ['Observing', 'SelfDriving'].includes(mode);
  }
  onObservingStart() {
    this.events = podmanCmd.getEventStream();
    this.events.on('pod', event => {
      console.log('PodManPuppet pod event:', event);
      // TODO: debounce before submitting?
    });
    this.events.on('heartbeat', () => {
      console.log('PodManPuppet events heartbeat.');
      this.trySubmitObservations();
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
