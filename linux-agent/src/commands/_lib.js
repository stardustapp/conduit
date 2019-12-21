const promisify = require('util').promisify;
const exec = promisify(require('child_process').exec);

const execa = require('execa');

exports.execForLine =
async function execForLine(cmd) {
  const {stdout, stderr} = await exec(cmd);
  if (stderr.length > 0) {
    return stderr.trim();
  }
  return stdout.trim();
};

exports.execForBuffer =
async function execForBuffer(command, stream='stdout', encoding=null) {
  const [cmd, ...argv] = typeof command === 'string'
    ? command.split(' ') : command;

  const subprocess = execa(cmd, argv, {
    all: stream === 'all',
  });
  const output = await exports
    .readWholeStream(subprocess[stream], encoding);

  await subprocess;
  return output;
}

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

exports.readTextTable =
function readTextTable(lines) {
  if (lines.length < 1) return [];

  // record column positioning for each header field
  const fields = [];
  lines.shift()
    .match(/ *[^ ]+ */g) // capture including whitespace
    .reduce((accum, raw) => {
      fields.push({
        text: raw.trim(),
        start: accum,
        end: accum+raw.length-1,
      });
      // accumulate starting index
      return accum+raw.length;
    }, 0);

  // last field reads until the last column of the data row
  fields.slice(-1)[0].end = undefined;

  // slice each field out of the lines
  return lines.map(line => {
    const row = {};
    for (const {text, start, end} of fields) {
      row[text] = line.slice(start, end).trim();
    }
    return row;
  });
}
