const {execForLine} = require('./_lib.js');

// ['install' or 'hold' or 'deinstall', 'ok', 'installed' or 'config-files']
exports.getPackageStatus = async function(packageName) {
  try {
    const output = await execForLine(`dpkg-query -W --showformat='\${Status}' "${packageName}"`);
    return output.split(' ');

  } catch (err) {
    console.warn("Warn: `dpkg-query` failed, assuming", packageName, "isn't installed");
    return [];
  }
};

exports.isPkgInstalledOk = function (packageName) {
  return exports.getPackageStatus(packageName)
    .then(ary => ary.includes('ok') && ary.includes('installed'));
};
