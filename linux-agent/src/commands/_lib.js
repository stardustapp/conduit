const promisify = require('util').promisify;
const exec = promisify(require('child_process').exec);

exports.execForLine =
async function execForLine(cmd) {
  const {stdout, stderr} = await exec(cmd);
  if (stderr.length > 0) {
    return stderr.trim();
  }
  return stdout.trim();
};

exports.readWholeStream =
function readWholeStream(readStream, encoding=false) {
  if (!readStream) throw new Error(
    `readWholeStream() requires 'readStream'`);
  return new Promise((resolve, reject) => {
    const chunks = new Array;
    readStream.on('data', function (chunk) {
      chunks.push(chunk);
    });
    readStream.on('end', function () {
      const buffer = Buffer.concat(chunks);
      resolve(encoding ? buffer.toString(encoding) : buffer);
    });
  });
};
