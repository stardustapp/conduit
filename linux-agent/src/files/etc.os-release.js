const promisify = require('util').promisify;
const readFile = promisify(require('fs').readFile);

exports.readOsRelease = async function() {
  const osRelease = {};
  const rawText = await readFile('/etc/os-release', {
    encoding: 'utf-8',
  });

  for (const line of rawText.split('\n')) {
    const sIdx = line.indexOf('=');
    if (sIdx < 0) continue;
    let rawVal = line.slice(sIdx+1);
    if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
      rawVal = rawVal.slice(1, -1);
    }
    osRelease[line.slice(0, sIdx)] = rawVal;
  }

  return osRelease;
};
