exports.PuppetManager =
class PuppetManager {
  constructor(ddpClient) {
    this.ddpClient = ddpClient;
    this.controllers = new Map;

    this.registerPuppet('AgentUpgrade', require('./AgentUpgrade.js'));
    this.registerPuppet('SmartDrive', require('./SmartDrive.js'));
    this.registerPuppet('ContainerNetwork', require('./ContainerNetwork.js'));
    this.registerPuppet('PodMan', require('./PodMan.js'));
    this.registerPuppet('NetDevice', require('./NetDevice.js'));
    this.registerPuppet('WireGuard', require('./WireGuard.js'));

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
