const execa = require('execa');
const {readWholeStream} = require('./_lib.js');

exports.queryInstalledPackage = async function(name) {
  const subprocess = execa(`rpm`, [`-q`, `--`, name]);
  const stdout = await readWholeStream(subprocess.stdout, 'utf-8');
  return stdout.trim();
};
