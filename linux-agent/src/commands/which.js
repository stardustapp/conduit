const execa = require('execa');
const {readWholeStream} = require('./_lib.js');

exports.lookup = async function(name) {
  const subprocess = execa(`which`, [`--`, name]);
  const stdout = await readWholeStream(subprocess.stdout, 'utf-8');
  return stdout.trim();
};
exports.isPresent = async function(name) {
  return !! await exports.lookup(name);
};

// basic test entrypoint
if (require.main === module) {
  (async () => {
    for (const test of ['which', 'wireguard', 'systemctl', 'danopia']) {
      console.log(test, ':', await exports.isPresent(test), await exports.lookup(test));
    }
  })();
}
