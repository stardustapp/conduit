const wgCmd = require('../commands/wg.js');

module.exports = class WireGuardPuppet extends require('./_base.js') {
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
