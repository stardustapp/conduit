exports.ControllerManager = class ControllerManager {
  constructor(recordManager, controllerImpls={}) {
    this.recordManager = recordManager;
    this.controllerImpls = controllerImpls;

    TODO(`init the individual controllers`);
  }

  publishSelfDriving(nodeId) {
    TODO(`publish self-driving info from controllers`);
  }
}
