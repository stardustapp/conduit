const {execForLine} = require('./_lib.js');

// Check if systemd is willing to have a conversation
exports.canConverse = async function() {
  const unit = '_health-sentinel.service';
  const systemdStatus = await execForLine(`systemctl status ${unit} || true`);
  // The "not found" error message includes unit name, so it'll still be there
  // If more fundamental things are wrong, the unit name won't be mentioned
  return systemdStatus.includes(unit);
};

exports.hasUnitFile = function(unitFile) {
  return execForLine(`systemctl cat -- ${unitFile}`)
    .then(() => true, () => false);
}

// exports.unitStatus = async function(unitName) {
//   const systemdStatus = await execForLine(`systemctl status ${unitName} || true`);
//   return systemdStatus.includes(unitName);
// };
