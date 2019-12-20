const semver = require('semver');

const myVersion = require('../../package.json').version;
const {runAction} = require('../commands/_actions.js');
const dpkgQueryCmd = require('../commands/dpkg-query.js');
const rpmCmd = require('../commands/rpm.js');
const whichCmd = require('../commands/which.js');

const hasDnfPromise = whichCmd.isPresent('dnf');

module.exports = class AgentUpgradePuppet extends require('./_base.js') {
  async canSelfDrive() {
    if (await hasDnfPromise) {
      return !!await rpmCmd.queryInstalledPackage('conduit-agent');
    } else {
      return await dpkgQueryCmd.isPkgInstalledOk('conduit-agent');
    }
  }

  onSelfDriving({latestVersion}) {
    this.cancelAnyTimer('Cancelling pending upgrade due to new config');
    const {AgentName, VersionString, GitCommit} = latestVersion;

    hasDnfPromise.then(hasDnf => {
      const systemType = hasDnf ? 'Rpm' : 'Deb';
      const latestUrl = latestVersion[`${systemType}Url`];

      if (VersionString === myVersion) return this.log(
        `Ignoring version ${VersionString}, same as current version ${myVersion}`);
      if (semver.gt(myVersion, VersionString)) return this.log(
        `Ignoring version ${VersionString}, looks older than current version ${myVersion}`);
      if (!latestUrl) return this.log(
        `Ignoring version ${VersionString}, lacks a ${systemType}Url value`);

      this.log('WILL UPGRADE from', myVersion, 'to', AgentName, VersionString, 'in 5s!');
      this.timer = setTimeout(async () => {
        this.timer = null;
        this.log('Starting agent upgrade script...');
        await runAction('agent-upgrade', [VersionString, systemType, latestUrl]);
      }, 5000);
    });
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
