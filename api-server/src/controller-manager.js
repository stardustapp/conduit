exports.ControllerManager = class ControllerManager {
  constructor(recordManager, controllerImpls={}) {
    this.recordManager = recordManager;
    // this.controllerImpls = controllerImpls;

    this.controllers = new Map;
    for (const contrKey in controllerImpls) {
      const instance = new controllerImpls[contrKey](recordManager);
      this.controllers.set(contrKey, instance);
    }
  }

  syncActualState(nodeHandle, stateKey, actualState) {
    if (this.controllers.has(stateKey)) {
      const controller = this.controllers.get(stateKey);
      if (typeof controller.syncActualState === 'function') {
        return controller.syncActualState(nodeHandle, actualState);
      } else throw new Error(`State Controller ${stateKey} does not accept actual state`);
    } else throw new Error(`State Controller ${stateKey} is not registered`);
  }

  publishSelfDriving(nodeId) {
    TODO(`publish self-driving info from controllers`);
  }
}
