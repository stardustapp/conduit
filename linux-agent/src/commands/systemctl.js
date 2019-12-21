const execa = require('execa');
const {execForLine, execForBuffer, readTextTable} = require('./_lib.js');

// Check if systemd is willing to have a conversation
exports.canConverse =
async function() {
  const unit = '_health-sentinel.service';
  const systemdStatus = await execForLine(`systemctl status ${unit} || true`);
  // The "not found" error message includes unit name, so it'll still be there
  // If more fundamental things are wrong, the unit name won't be mentioned
  return systemdStatus.includes(unit);
};

exports.hasUnitFile =
function(unitFile) {
  return execForLine(`systemctl cat -- ${unitFile}`)
    .then(() => true, () => false);
}

function readSystemCtlTable(buffer) {
  // check for 'empty' output (as in, "0 units listed")
  if (buffer[0] === 48 /* '0' */) return [];

  const lines = buffer.toString('utf-8').split('\n\n')[0].split('\n');
  // support for single spaces in the header row
  lines[0] = lines[0].replace(/([^ ]) ([^ ])/g, (_, a, b)=>`${a}_${b}`);
  return readTextTable(lines);
}

exports.listAllMatchingUnits =
async function(pattern='') {
  const output = await execForBuffer([`systemctl`,`list-units`,`--all`,`--`, pattern]);
  return readSystemCtlTable(output);
}

exports.filterToEnabledUnits =
function(unitList) {
  if (unitList.length < 1) return [];
  return execForBuffer([`systemctl`, `is-enabled`, `--`, ...unitList])
    .then(buffer => buffer
      .toString('utf-8')
      .trim().split('\n')
      .map((line, idx) => { switch (line) {
        case 'enabled': return unitList[idx];
        case 'disabled': return false;
        default: throw new Error(`systemctl is-enabled gave ${line} for idx ${idx}`);
      }})
      .filter(x => x));
}
