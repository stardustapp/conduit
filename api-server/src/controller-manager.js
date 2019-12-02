const {ControllerClient} = require('./controller-client.js');

exports.ControllerManager = class ControllerManager {
  constructor(recordManager, controllerImpls={}) {
    this.recordManager = recordManager;
    // this.controllerImpls = controllerImpls;

    this.controllers = new Map;
    for (const contrKey in controllerImpls) {
      const instance = new controllerImpls[contrKey](recordManager);
      this.controllers.set(contrKey, instance);
    }

    this.connectedNodes = new Map;
  }

  syncActualState(nodeHandle, stateKey, actualState) {
    if (this.controllers.has(stateKey)) {
      const controller = this.controllers.get(stateKey);
      if (typeof controller.syncActualState === 'function') {
        return controller.syncActualState(nodeHandle, actualState);
      } else throw new Error(`State Controller ${stateKey} does not accept actual state`);
    } else throw new Error(`State Controller ${stateKey} is not registered`);
  }

  publishSelfDriving(nodeHandle, ddpClient) {
    const node = new ControllerClient(nodeHandle, ddpClient, this);
    this.connectedNodes.set(nodeHandle._id, node);
  }
}
