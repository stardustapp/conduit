function noopSelfDriver(nodeHandle, contrKey, subscriber) {
  TODO(`${nodeHandle} wanted to self-drive ${contrKey} but it is NOT IMPLEMENTED`);
  subscriber.informFields({
    unimplemented: true,
  });
  return {stop: () => {}};
}

exports.ControllerClient = class ControllerClient {
  constructor(nodeHandle, ddpClient, controllerManager) {
    this.nodeHandle = nodeHandle;
    this.ddpClient = ddpClient;
    this.controllerManager = controllerManager;

    this.controllerModes = new Map;
    this.selfDrivingFields = new Map;
    this.selfDrivingSubs = new Map;
    this.contextSubs = new Map;

    const nodeCursor = nodeHandle.reactiveCursor();

    this.updateConfig(nodeCursor.data());
    this.nodeOnChange = nodeCursor.onChange(newData => {
      this.updateConfig(newData);
    });

    ddpClient.addCloser(this.stop.bind(this));
  }

  stop() {
    console.log('Stopping ControllerClient for', this.nodeHandle);
    for (const subscription of this.selfDrivingSubs.values()) {
      subscription.stop();
    }
    for (const subscription of this.contextSubs.values()) {
      subscription.stop();
    }

    this.nodeOnChange.stop();
    this.nodeOnChange = null;

    this.controllerModes = null;
    this.selfDrivingFields = null;
    this.selfDrivingSubs = null;
    this.contextSubs = null;
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
    // console.log(contrKey, oldMode, '->', newMode);

    const controller = this.controllerManager.controllers.get(contrKey);

    // Optionally publish useful state as long as the puppet is there to listen
    if (newMode !== 'Unavailable' && controller.publishContext) {
      const sub = controller.publishContext(this.nodeHandle, this.ddpClient);
      this.contextSubs.set(contrKey, sub);
    } else {
      if (this.contextSubs.has(contrKey)) {
        this.contextSubs.get(contrKey).stop();
        this.contextSubs.delete(contrKey);
      }
    }

    if (newMode === 'SelfDriving') {
      let sentInitial = !!oldMode;
      let addtlFields = {
        Mode: newMode,
      };

      const subscriber = {
        informFields: this.sendSelfDrivingFields.bind(this, contrKey),
      };
      const subscription = controller.publishSelfDriving
        ? controller.publishSelfDriving(this.nodeHandle, subscriber)
        : noopSelfDriver(this.nodeHandle, contrKey, subscriber);
      this.selfDrivingSubs.set(contrKey, subscription);

      // TODO: more critical probably
      if (!this.selfDrivingFields.has(contrKey)) {
        console.warn('BUG: Controller', contrKey, "failed to send initial", newMode, "fields");
      }

    } else {
      if (this.selfDrivingSubs.has(contrKey)) {
        this.selfDrivingSubs.get(contrKey).stop();
        this.selfDrivingSubs.delete(contrKey);
      }
      this.resetSelfDrivingMode(contrKey, newMode);
    }

    this.controllerModes.set(contrKey, newMode);
  }

  sendSelfDrivingFields(contrKey, fields) {
    const sentInitial = this.controllerModes.has(contrKey);

    const sentSelfDriving = this.selfDrivingFields.has(contrKey);
    const internalFields = {};
    if (!sentSelfDriving) {
      this.selfDrivingFields.set(contrKey, new Set);
      internalFields.Mode = 'SelfDriving';
    }

    this.transmitUpdate(contrKey, sentInitial ? 'changed' : 'added', {
      fields: {
        ...internalFields,
        ...fields,
      }});

    const sentFields = this.selfDrivingFields.get(contrKey);
    for (const key in fields) {
      sentFields.add(key);
    }
  }

  resetSelfDrivingMode(contrKey, newMode) {
    const sentInitial = this.controllerModes.has(contrKey);
    const removedFields = Array.from(this.selfDrivingFields.get(contrKey) || []);
    const extraAttrs = {};
    if (sentInitial && removedFields.length > 0) {
      extraAttrs.removed = removedFields;
    }

    this.transmitUpdate(contrKey, sentInitial ? 'changed' : 'added', {
      ...extraAttrs, // sometimes removed
      fields: {
        Mode: newMode,
      }});

    this.selfDrivingFields.delete(contrKey);
  }

  transmitUpdate(contrKey, msg, payload) {
    console.log('--> Controller', contrKey, msg, payload);
    this.ddpClient.sendMessage({
      collection: 'Controllers',
      msg, id: contrKey,
      ...payload,
    });
  }
}
