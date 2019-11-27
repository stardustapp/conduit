const execa = require('execa');

function readWholeStream(readStream) {
  return new Promise((resolve, reject) => {
    const chunks = new Array;
    readStream.on('data', function (chunk) {
      chunks.push(chunk);
    });
    readStream.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
  });
}

async function runAction(scriptName, argv=[], env={}) {
  // TODO: use a fixed exec path
  console.log('--- action invoked:', actionName, argv, env);
  const allArgs = [
    `${process.cwd()}/src/actions/${scriptName}.sh`,
    ...argv];

  const subprocess = execa(`sudo`, allArgs, {
    env: env,
    all: true,
  });

  setTimeout(() => {
  	subprocess.kill('SIGTERM', {
  		forceKillAfterTimeout: 60 * 1000,
  	});
  }, 60*60 * 1000);

  const allOut = await readWholeStream(process.all);
  console.log('--- action output:');
  console.log(allOut);

  await subprocess; // probs throws
  console.log('--- action completed :)');
  return allOut;
}

exports.agentUpgrade = async function(newVersionCode) {
  try {

    const output = await execForLine(`dpkg-query -W --showformat='\${Status}' "${packageName}"`);
    return output.split(' ');

  } catch (err) {
    console.warn("Warn: `dpkg-query` failed, assuming", packageName, "isn't installed");
    return [];
  }
};
