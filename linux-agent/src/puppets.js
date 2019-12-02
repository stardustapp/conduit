const {runAction} = require('./commands/_actions');

class PuppetBase {
  constructor(reactiveConfig) {
    this.currentMode = 'Initial';
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

exports.PuppetManager = class PuppetManager {
  constructor(ddpClient) {
    this.ddpClient = ddpClient;
    this.controllers = new Map;
    this.registerPuppet('AgentUpgrade', AgentUpgradePuppet);

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

    const controller = new implConstructor(reactiveConfig);
    this.controllers.set(contrKey, controller);
  }
}
