module.exports =
class PuppetBase {
  constructor(manager, reactiveConfig, syncActual) {
    this.puppetManager = manager;
    this.currentMode = 'Initial';
    this.syncActual = syncActual;
    reactiveConfig.onChange(this.acceptConfig.bind(this));
  }
  log(...msg) {
    console.log(`${this.constructor.name}:`, ...msg);
  }

  acceptConfig({id, Mode, ...params}) {
    this.log('new puppet state', Mode, `(was ${this.currentMode})`);
    if (Mode !== this.currentMode) {
      this.onModeChanged(Mode, params);
    } else if (Mode === 'SelfDriving') {
      this.onSelfDrivingUpdate(params);
    }
    this.currentMode = Mode;
  }
  onModeChanged(newMode, params) {
    if (newMode === 'SelfDriving') {
      this.onSelfDrivingStart(params);
    } else if (this.currentMode === 'SelfDriving') {
      this.onSelfDrivingStop(newMode);
    }

    const wasObserving = this.shouldObserveMode(this.currentMode);
    if (this.shouldObserveMode(newMode)) {
      if (!wasObserving) this.onObservingStart(newMode);
    } else if (wasObserving) {
      this.onObservingStop(newMode);
    }
  }

  onSelfDrivingStart(initialParams) {
    if (this.onSelfDriving) this.onSelfDriving(initialParams);
    else TODO(`${this.constructor.name} onSelfDrivingStart`, initialParams);
  }
  onSelfDrivingUpdate(updatedParams) {
    if (this.onSelfDriving) this.onSelfDriving(updatedParams);
    else TODO(`${this.constructor.name} onSelfDrivingUpdate`, updatedParams);
  }
  onSelfDrivingStop(newMode) {
    TODO(`${this.constructor.name} onSelfDrivingStop`, newMode);
  }

  shouldObserveMode(mode) {
    return mode === 'Observing';
  }
  onObservingStart(newMode) {
    TODO(`${this.constructor.name} onObservingStart`, newMode);
  }
  onObservingStop(newMode) {
    TODO(`${this.constructor.name} onObservingStop`, newMode);
  }

  trySubmitObservations(...args) {
    return this
      .submitObservations(...args)
      .catch(err => {
        console.log(`${this.constructor.name} failed to submitObservations:`, err);
        return err;
      });
  }
}
