const debounce = require('debounce');

class AgentVariant {
  constructor(versionCursor) {
    this.subscribers = new Set;
    this.processSnapshot(versionCursor.data());
    versionCursor.onChange(this.processSnapshot.bind(this));
  }

  processSnapshot(newData) {
    const {AgentName, VersionString, GitCommit, ReleasedAt, SrcUrl, DebUrl, RpmUrl} = newData;
    this.currentVersion = {AgentName, VersionString, GitCommit, ReleasedAt, SrcUrl, DebUrl, RpmUrl};

    console.log('AgentUpgrade: Newest version is', VersionString, 'from', ReleasedAt)
    for (const subscriber of this.subscribers) {
      subscriber.informFields({ latestVersion: this.currentVersion });
    }
  }

  addSubscriber(subscriber) {
    subscriber.informFields({
      latestVersion: this.currentVersion,
    });

    this.subscribers.add(subscriber);
    return {stop: () => {
      this.subscribers.delete(subscriber);
    }};
  }
}

exports.AgentUpgrade =
class AgentUpgradeController {

  constructor(recordManager) {
    this.recordManager = recordManager;
    this.variants = new Map;

    //TODO: better way to strip fields
    // const {VersionString, ReleasedAt, DebUrl, }

    // console.log('data:', versionCursor.data());
    // versionCursor.onChange((newData)=>{
    //   console.log('new data:', newData);
    // });

    // let latestVersion =
    // releasedVersions.onChange(function (...asdf) {
    //   console.log(asdf);
    // });
  }

  publishSelfDriving(nodeHandle, subscriber) {
    const {type} = nodeHandle.latestData;
    if (type !== 'LinuxNode') throw new Error(
      `TODO: AgentUpgrade can only publish to LinuxNode so far`);

    return this.getVariant('linux-agent').addSubscriber(subscriber);
  }

  getVariant(variantName) {
    if (this.variants.has(variantName)) {
      return this.variants.get(variantName);
    }

    const versionCursor = this.recordManager
      .findRecordsRaw('AgentVersion', record =>
        record.AgentName === variantName && !!record.ReleasedAt)
      .reactive()
      .sort((a, b) => b.ReleasedAt - a.ReleasedAt)
      .one();

    const variant = new AgentVariant(versionCursor);
    this.variants.set(variantName, variant);
    return variant;
  }
}
