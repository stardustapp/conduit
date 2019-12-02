class SelfDrivingNode {
  constructor(nodeHandle, ddpClient, controllerManager) {
    this.nodeHandle = nodeHandle;
    this.ddpClient = ddpClient;
    this.controllerManager = controllerManager;

    this.controllerModes = new Map;
    this.controllerFields = new Map;
    this.contrSubscriptions = new Map;

    const nodeCursor = nodeHandle.reactiveCursor();

    this.updateConfig(nodeCursor.data());
    this.nodeOnChange = nodeCursor.onChange(newData => {
      this.updateConfig(newData);
    });
  }

  updateConfig(nodeData) {
    // console.log('node new:', nodeCursor.data());
    const {SelfDrivingAvailable, SelfDrivingActive, SelfDrivingPaused} = nodeData;
    for (const [contrKey, controller] of this.controllerManager.controllers) {
      const oldMode = this.controllerModes.get(contrKey);
      const newMode
        = SelfDrivingPaused.includes(contrKey) ? 'Paused'
        : SelfDrivingActive.includes(contrKey) ? 'SelfDriving'
        : SelfDrivingAvailable.includes(contrKey) ? 'Observing'
        : 'Unavailable';
      if (oldMode !== newMode) {
        this.setControllerMode(contrKey, oldMode, newMode);
      }
    }
  }

  setControllerMode(contrKey, oldMode, newMode) {
    console.log(contrKey, oldMode, '->', newMode);

    const controller = this.controllerManager.controllers.get(contrKey);

    if (newMode === 'SelfDriving') {
      let sentInitial = !!oldMode;
      let addtlFields = {
        Mode: newMode,
      };

      const subscriber = {
        informFields: this.sendSelfDrivingFields.bind(this, contrKey),
      };
      const subscription = controller.publishSelfDriving(this.nodeHandle, subscriber);
      this.contrSubscriptions.set(contrKey, subscription);

    } else {
      if (this.contrSubscriptions.has(contrKey)) {
        this.contrSubscriptions.get(contrKey).stop();
      }
      this.resetSelfDrivingMode(contrKey, newMode);
    }

    this.controllerModes.set(contrKey, newMode);
  }

  sendSelfDrivingFields(contrKey, fields) {
    const sentInitial = this.controllerModes.has(contrKey);

    const sentSelfDriving = this.controllerFields.has(contrKey);
    const internalFields = {};
    if (!sentSelfDriving) {
      this.controllerFields.set(contrKey, new Set);
      internalFields.Mode = 'SelfDriving';
    }

    this.transmitUpdate(contrKey, sentInitial ? 'changed' : 'added', {
      fields: {
        ...internalFields,
        ...fields,
      }});

    const sentFields = this.controllerFields.get(contrKey);
    for (const key in fields) {
      sentFields.add(key);
    }
  }

  resetSelfDrivingMode(contrKey, newMode) {
    const sentInitial = this.controllerModes.has(contrKey);
    const removedFields = Array.from(this.controllerFields.get(contrKey) || []);
    const extraAttrs = {};
    if (sentInitial && removedFields.length > 0) {
      extraAttrs.removed = removedFields;
    }

    this.transmitUpdate(contrKey, sentInitial ? 'changed' : 'added', {
      ...extraAttrs, // sometimes removed
      fields: {
        Mode: newMode,
      }});

    this.controllerFields.delete(contrKey);
  }

  transmitUpdate(contrKey, msg, payload) {
    console.log('--> SelfDriving', contrKey, msg, payload);
    this.ddpClient.sendMessage({
      collection: 'SelfDriving',
      msg, id: contrKey,
      ...payload,
    });
  }
}

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

  publishSelfDriving(nodeHandle, ddpClient) {
    TODO(`publish self-driving info from controllers`);

    const node = new SelfDrivingNode(nodeHandle, ddpClient, this);

    // this.controllers.get('AgentUpgrade').publishSelfDriving(nodeHandle, ddpClient);
  }
}
