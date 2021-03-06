const execa = require('execa');
const {readWholeStream, readTextTable} = require('./_lib.js');

exports.test = async function() {
  const subprocess = execa(`smartctl`, [`--version`], {
    all: true,
  });

  const allOut = readWholeStream(subprocess.all, 'utf-8');
  try {
    await subprocess;

    const outText = await allOut;
    return outText.startsWith('smartctl');

  } catch (err) {
    console.log('smartctl cannot be used!', err.originalMessage || err);
    // console.log('--- smartctl output:');
    // console.log((await allOut).toString('utf-8'));
    return false;
  }
}

exports.scanDevices = async function() {
  const subprocess = execa(`smartctl`, [`--scan`]);
  const stdout = await readWholeStream(subprocess.stdout, 'utf-8');
  await subprocess;

  return stdout.split('\n').slice(0, -1).map(line => {
    const match = line.match(/^([^ ]+) ([^#]+)? # (.+)/);
    if (match) {
      return {path: match[1], args: match[2], comment: match[3]};
    } else {
      return {comment: line};
    }
  });
}

exports.readAllForDevice = async function(path) {
  const subprocess = execa(`sudo`, [`smartctl`, `-a`, `--`, path]);
  const stdout = await readWholeStream(subprocess.stdout, 'utf-8');
  await subprocess;

  const report = {
    CollectionTime: new Date,
    Information: {},
    SelfAssessment: 'TODO',
    GeneralValues: [],
    AttributesVersion: -1,
    Attributes: [],
    ErrorLogVersion: -1,
    ErrorLog: [],
    SelfTestLogVersion: -1,
    SelfTestLog: [],
    SelfTestTableVersion: -1,
    SelfTestTable: [],
    SelfTestFlags: 'TODO',
  };

  for (const block of stdout.trim().split('\n\n').slice(1)) {
    const [headLine, ...lines] = block.trim().split('\n');
    const revNumber = parseInt((headLine.match(/ \d+$/) || ['-1'])[0]);
    switch (true) {

      case headLine === '=== START OF INFORMATION SECTION ===':
        for (const line of lines) {
          const [_, label, content] = line.match(/^([^:]+): +(.+)$/);
          report.Information[label.replace(/ is$/,'')] = content;
        }
        break;

      case headLine.startsWith('SMART Attributes Data Structure'):
        report.AttributesVersion = revNumber;
        report.Attributes = readTextTable(lines.slice(1));
        break;

      case headLine.startsWith('SMART Self-test log structure'):
        report.SelfTestLogVersion = revNumber;
        report.SelfTestLog = readTextTable(lines);
        break;

      default:
        console.log('unknown smartctl block header:', headLine);
    }
  }
  return report;
};

exports.dumpAll = async function() {
  const devices = await this
    .scanDevices();
  return await Promise
    .all(devices
      .map(x => this
        .readAllForDevice(x.path)
        .then(findings => ({
          Device: x,
          ...findings,
        }))));
};

// basic test entrypoint
if (require.main === module) {
  (async () => {
    if (await exports.test()) {
      console.log('Devices:', await exports.scanDevices());
      console.log('First disk:', await exports.readAllForDevice('/dev/sda'));
      console.log(JSON.stringify(await exports.dumpAll()));
    } else {
      console.log('smartctl not usable');
    }
  })();
}
