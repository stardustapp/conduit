const promisify = require('util').promisify;
const sleepMs = promisify(setTimeout);
const execa = require('execa');
const {readWholeStream} = require('./_lib.js');

const useSudo = process.env.CONDUIT_PODMAN_SUDO
  || require('os').userInfo().username === 'conduit';
function execPodMan(args, opts={}) {
  if (typeof args === 'string'
    ) args = args.split(' ');
  if (useSudo) return execa(
    `sudo`, [`podman`, ...args], opts);
  return execa(`podman`, args, opts);
}

exports.test = async function() {
  const subprocess = execPodMan([`ps`], {
    all: true,
  });

  const allOut = readWholeStream(subprocess.all, 'utf-8');
  try {
    await subprocess;

    const outText = await allOut;
    return outText.startsWith('CONTAINER ID');

  } catch (err) {
    console.log('podman cannot be used!', err.originalMessage || err);
    return false;
  }
};

exports.deleteNetwork = async function (network, {
  force=false,
}={}) {
  await execPodMan([`network`, `rm`, `--`, network]);
  // await unlink(path);
};

exports.inspectPodConf = async function(podId, enabledUnits=null) {
  const subprocess = execPodMan([`pod`, `inspect`, `--`, podId]);
  const stdout = await readWholeStream(subprocess.stdout, 'utf-8');
  await subprocess;

  // grab selective unit list if it wasn't furnished
  const podUnitName = `pod-${podId}.service`;
  enabledUnits = enabledUnits || await exports.listEnabledUnits(podUnitName);

  const {Config} = JSON.parse(stdout);
  const infraConfig = Config.infraConfig || {};
  return {
    Labels: Config.labels,
    // TODO: NetworkName
    RestartAfter: [
      enabledUnits.includes(podUnitName) && `enabledUnits`
    ].filter(x => x),
    PublishPorts: (infraConfig.infraPortBindings || []).map(port => {
      const tokens = [port.hostIP, port.hostPort, port.containerPort];
      while (!tokens[0]) tokens.shift();
      return tokens.join(':');
    }),
    NetworkNames: infraConfig.infraNetworks,
  };
};

exports.listEnabledUnits = async function(pattern) {
  const subprocess = execa(`systemctl`, [`list-unit-files`, `--state=enabled`, `--`, pattern]);
  const stdout = await readWholeStream(subprocess.stdout, 'utf-8');
  await subprocess;

  if (stdout.includes('0 unit files listed.')) return [];
  return stdout.split('\n').slice(1,-2).map(line => line.split(' ')[0]);
};

exports.dumpPods = async function(andInspect=false) {
  const subprocess = execPodMan(`pod ps --no-trunc --format json`);
  const stdout = await readWholeStream(subprocess.stdout, 'utf-8');
  await subprocess;

  const pods = JSON.parse(stdout).map(pod => {
    return {
      PodName: pod.name,
      Status: {
        Created: new Date(pod.createdAt),
        Id: pod.id,
        ContainerCount: pod.numberOfContainers,
        State: pod.status,
      },
    };
  });

  // skip out if we just wanted status
  if (!andInspect) return pods;

  // try fetching the configuration for the pod so we can diff
  const enabledUnits = await exports.listEnabledUnits('pod-*');
  const inspectedPods = [];
  for (const pod of pods) {
    inspectedPods.push({
      ...pod,
      ...await exports.inspectPodConf(pod.Status.Id, enabledUnits),
    });
  }
  return inspectedPods;
};

const EventEmitter = require('events');
function createEventStream() {
  const subprocess = execPodMan(`events --format json`, {
    buffer: false,
  });

  subprocess.unref();
  subprocess.stdin.end();
  subprocess.stdout.unref();
  subprocess.stderr.unref();

  subprocess
    .catch(err => err)
    .then(out => {
      // TODO: detect it not being supported at all
      // if (out.exitCode !== 0) throw new Error(
      //   `"podman events" exited with code ${out.exitCode}`);
      console.warn(`WARN: "podman events" exited with code ${out.exitCode}, assuming it's broken`);

      // send dummy messages regularly instead
      setInterval(() => {
        emitter.emit('heartbeat')
      }, 2 * 60 * 1000);
    });

  const emitter = new EventEmitter();
  subprocess.stdout.on('data', function (chunk) {
    for (const line of chunk.toString('utf-8').trim().split('\n')) {
      const event = JSON.parse(line);
      emitter.emit(event.Type, event);
    }
  });
  return emitter;
};

let podmanEventEmitter = null;
exports.getEventStream = function() {
  if (!podmanEventEmitter
    ) podmanEventEmitter = createEventStream();
  return podmanEventEmitter;
}

// basic test entrypoint
if (require.main === module) {
  (async () => {
    if (await exports.test()) {
      console.log('Pods:', await exports.dumpPods(false));

      console.log('testing podman events');
      exports.getEventStream().on('pod', event => {
        console.log('pod event:', event);
      });
      // await sleepMs(100);
      await execPodMan(`pod create --name conduit-test`);
      await execPodMan(`pod rm conduit-test`);
      await sleepMs(1000);
      console.log('test complete');

    } else {
      console.log('podman not usable');
    }
  })();
}
