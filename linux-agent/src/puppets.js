const {runAction} = require('./commands/_actions');

class PuppetBase {
  constructor(manager, reactiveConfig, syncActual) {
    this.puppetManager = manager;
    this.currentMode = 'Initial';
    this.syncActual = syncActual;
    reactiveConfig.onChange(this.acceptConfig.bind(this));
  }
  log(...msg) {
    console.log(`${this.constructor.name}:`, ...msg);
  }

  acceptConfig({id, Mode, ...params}) {
    this.log('new puppet state', Mode, `(was ${this.currentMode})`);
    if (Mode !== this.currentMode) {
      this.onModeChanged(Mode, params);
    } else if (Mode === 'SelfDriving') {
      this.onSelfDrivingUpdate(params);
    }
    this.currentMode = Mode;
  }
  onModeChanged(newMode, params) {
    if (newMode === 'SelfDriving') {
      this.onSelfDrivingStart(params);
    } else if (this.currentMode === 'SelfDriving') {
      this.onSelfDrivingStop(newMode);
    }

    const wasObserving = this.shouldObserveMode(this.currentMode);
    if (this.shouldObserveMode(newMode)) {
      if (!wasObserving) this.onObservingStart(params);
    } else if (wasObserving) {
      this.onObservingStop(newMode);
    }
  }

  onSelfDrivingStart(initialParams) {
    if (this.onSelfDriving) this.onSelfDriving(initialParams);
    else TODO(`${this.constructor.name} onSelfDrivingStart`, initialParams);
  }
  onSelfDrivingUpdate(updatedParams) {
    if (this.onSelfDriving) this.onSelfDriving(updatedParams);
    else TODO(`${this.constructor.name} onSelfDrivingUpdate`, updatedParams);
  }
  onSelfDrivingStop(newMode) {
    TODO(`${this.constructor.name} onSelfDrivingStop`, newMode);
  }

  shouldObserveMode(mode) {
    return mode === 'Observing';
  }
  onObservingStart() {
    TODO(`${this.constructor.name} onObservingStart`);
  }
  onObservingStop(newMode) {
    TODO(`${this.constructor.name} onObservingStop`, newMode);
  }
}

const myVersion = require('../package.json').version;
const semver = require('semver');
class AgentUpgradePuppet extends PuppetBase {
  onSelfDriving({latestVersion}) {
    this.cancelAnyTimer('Cancelling pending upgrade due to new config');
    const {AgentName, VersionString, GitCommit, DebUrl} = latestVersion;

    if (VersionString === myVersion) return this.log(
      `Ignoring version ${VersionString}, same as current version ${myVersion}`);
    if (semver.gt(myVersion, VersionString)) return this.log(
      `Ignoring version ${VersionString}, looks older than current version ${myVersion}`);
    if (!DebUrl) return this.log(
      `Ignoring version ${VersionString}, lacks a DebUrl value`);

    this.log('WILL UPGRADE from', myVersion, 'to', AgentName, VersionString, 'in 5s!');
    this.timer = setTimeout(async () => {
      this.timer = null;
      this.log('Starting agent upgrade script...');
      await runAction('agent-upgrade', [VersionString, DebUrl]);
    }, 5000);
  }
  onSelfDrivingStop() {
    this.cancelAnyTimer('Cancelling pending upgrade due to self-driving disengagement');
  }
  cancelAnyTimer(msg) {
    if (this.timer) {
      this.log(msg);
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

const smartctlCmd = require('./commands/smartctl.js');
class SmartDrivePuppet extends PuppetBase {
  async submitObservations() {
    try {
      const data = await smartctlCmd.dumpAll();
      // console.log('SMART:', JSON.stringify(data));
      await this.syncActual(data);
      console.log('Reported SMART data from', data.length, 'storage drives');
    } catch (err) {
      console.log('SmartDrivePuppet failed to gather drive data:', err);
    }
  }

  shouldObserveMode(mode) {
    return ['Observing', 'SelfDriving'].includes(mode);
  }
  onObservingStart() {
    const submit = () => this.submitObservations();
    // run now and then also later
    submit();
    this.timer = setInterval(submit, 60 * 60 * 1000); // Every hour
  }
  onObservingStop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

const cniFile = require('./files/etc.cni.js');
class ContainerNetworkPuppet extends PuppetBase {
  async onObservingStart() {
    try {
      const data = await cniFile.dumpAllNetworks();
      console.log(JSON.stringify(data));
      await this.syncActual(data);
      console.log('Reported', data.length, 'CNI networks');
    } catch (err) {
      console.log('ContainerNetworkPuppet failed to gather CNI data:', err);
    }
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

exports.PuppetManager = class PuppetManager {
  constructor(ddpClient) {
    this.ddpClient = ddpClient;
    this.controllers = new Map;
    this.registerPuppet('AgentUpgrade', AgentUpgradePuppet);
    this.registerPuppet('SmartDrive', SmartDrivePuppet);
    this.registerPuppet('ContainerNetwork', ContainerNetworkPuppet);

    // this.configSub = ddpClient
    //   .collection('Controllers')
    //   .onChange((state) => {
    //     console.log('previus controller data', state);
    //     console.log('next controller data', state.next);
    //   });
  }

  registerPuppet(contrKey, implConstructor) {
    const reactiveConfig = this.ddpClient
      .collection('Controllers')
      .filter(record => record.id === contrKey)
      .reactive().one();

    const syncActual = actual =>
      this.ddpClient.call('/Node/SyncActual', contrKey, actual);

    const controller = new implConstructor(this, reactiveConfig, syncActual);
    this.controllers.set(contrKey, controller);
  }
}
