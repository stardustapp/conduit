const smartctlCmd = require('../commands/smartctl.js');

module.exports = class SmartDrivePuppet extends require('./_base.js') {
  async canSelfDrive() {
    return await smartctlCmd.test();
  }

  async submitObservations() {
    const data = await smartctlCmd.dumpAll();
    // console.log('SMART:', JSON.stringify(data));
    await this.syncActual(data);
    console.log('Reported SMART data from', data.length, 'storage drives');
  }

  shouldObserveMode(mode) {
    return ['Observing', 'SelfDriving'].includes(mode);
  }
  onObservingStart() {
    // run now and then also later
    this.trySubmitObservations();
    this.timer = setInterval(this
      .trySubmitObservations.bind(this),
      60 * 60 * 1000); // Every hour
  }
  onObservingStop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
