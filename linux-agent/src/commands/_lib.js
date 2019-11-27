const promisify = require('util').promisify;
const exec = promisify(require('child_process').exec);

exports.execForLine = async function execForLine(cmd) {
  const {stdout, stderr} = await exec(cmd);
  if (stderr.length > 0) {
    return stderr.trim();
  }
  return stdout.trim();
}
