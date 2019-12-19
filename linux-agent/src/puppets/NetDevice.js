const ipCmd = require('../commands/ip.js');

module.exports = class NetDevicePuppet extends require('./_base.js') {
  async submitObservations() {
    const ifaces = await ipCmd.dumpDevices();
    // TODO: ifaces = ifaces.concat(await wgCmd.dumpAll());
    // TODO: add CNI ifaces

    const primaryIfaceId = await ipCmd.getDefaultDevice();
    const primaryIface = ifaces.find(x => x.DeviceName === primaryIfaceId);
    if (primaryIface) {
      primaryIface.NetFlags.push('INTERNET');
    }

    await this.syncActual(ifaces);
    console.log('Reported', data.length, 'NetDevices');
  }

  onObservingStart() {
    // run now and then also later
    this.trySubmitObservations();
    this.timer = setInterval(this
      .trySubmitObservations.bind(this),
      5 * 60 * 1000); // Somewhat regularly (TODO: iface change events?)
  }
  onObservingStop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
