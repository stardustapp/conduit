const wgCmd = require('../commands/wg.js');
const systemctlCmd = require('../commands/systemctl.js');

async function listSystemUnits() {
  const pre = 'wg-quick@', suf = '.service';

  const table = await systemctlCmd
    .listAllMatchingUnits(`${pre}*${suf}`);
  const enabledUnits = await systemctlCmd
    .filterToEnabledUnits(table
      .map(r => r.UNIT));

  return table.map(row => {
    return {
      UnitName: row.UNIT,
      DeviceName: row.UNIT.slice(pre.length, -suf.length),
      Enabled: enabledUnits.includes(row.UNIT),
      State: row.ACTIVE,
    };
  });
}

module.exports = class WireGuardPuppet extends require('./_base.js') {
  async canSelfDrive() {
    // test root access to `wg`
    const hasWgTools = await wgCmd.test();

    // check for wg-quick (to survive reboots)
    const hasSystemd = await systemctlCmd.canConverse();
    const hasWgQuickUnit = hasSystemd && await systemctlCmd.hasUnitFile('wg-quick@.service');

    return hasWgTools && hasWgQuickUnit;
  }

  async submitObservations(newMode=null) {
    const puppetMode = newMode || this.currentMode;
    // gather data
    const result = await this
      .syncActual({
        units: await listSystemUnits(),
        identities: await wgCmd.dumpAll(),
        willSelfDrive: puppetMode === 'SelfDriving',
      });
    // bail if that's it
    if (puppetMode === 'Observing') return;

    // perform whatever needs doing
    for (const action of result.actions) {
      switch (action.type) {
        // TODO
        default: this.log(`Server returned unknown action type`, action.type);
      }
    }
  }

  onModeChanged(newMode, params) {
    // proactively observe on any mode transition
    if (['Observing', 'SelfDriving'].includes(newMode)) {
      this.trySubmitObservations(newMode);
    }

    return super.onModeChanged(newMode, params);
  }

  // schedule regular observations while active
  shouldObserveMode(mode) {
    return ['Observing', 'SelfDriving'].includes(mode);
  }
  onObservingStart(newMode) {
    this.timer = setInterval(this
      .trySubmitObservations.bind(this),
      2 * 60 * 1000); // Regularly for net traffic
  }
  onObservingStop(newMode) {
    clearInterval(this.timer);
    this.timer = null;
  }
}
