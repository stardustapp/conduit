const {execForLine} = require('./_lib.js');

exports.checkForKernelModule = async function(modName) {
  try {
    const kernelModules = await execForLine(`lsmod`);
    return kernelModules
      .split('\n')
      .some(x => x
        .startsWith(modName+' '));

  } catch (err) {
    console.warn("Warn: `lsmod` failed, assuming", modName, "isn't loaded");
    return false;
  }
};
