const wgCmd = require('../commands/wg.js');
const systemctlCmd = require('../commands/systemctl.js');

module.exports = class WireGuardPuppet extends require('./_base.js') {
  async canSelfDrive() {
    const hasSystemd = await systemctlCmd.canConverse();
    const hasWgTools = await wgCmd.test();
    const hasWgQuickUnit = hasSystemd && await systemctlCmd.hasUnitFile('wg-quick@.service');
    return hasWgTools && hasWgQuickUnit;
  }

  async submitObservations() {
    await this.syncActual({
      identities: await wgCmd.dumpAll(),
    });
  }

  shouldObserveMode(mode) {
    return ['Observing', 'SelfDriving'].includes(mode);
  }
  onObservingStart() {
    // run now and then also later
    this.trySubmitObservations();
    this.timer = setInterval(this
      .trySubmitObservations.bind(this),
      2 * 60 * 1000); // Regularly for net traffic
  }
  onObservingStop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
