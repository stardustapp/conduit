#!/bin/sh -eux
# TODO: check that package is not held, if apt doesn't

UrlPrefix="https://s3-us-west-2.amazonaws.com/dist.stardustapp.run/deb/"
VersionCode="$1"
GivenUrl="$2"

if [ "${GivenUrl%%$UrlPrefix*}" ]
then
  echo "Given URL '${GivenUrl}' not in trusted prefix '${UrlPrefix}'"
  exit 5
fi

cd "$(mktemp -d)"

PackageFilename="conduit-agent_${VersionCode}_all.deb"
wget -O "${PackageFilename}" "${GivenUrl}" \
  2> wget-output.log

if ! grep " \[application/x-debian-package\]$" wget-output.log
then
  grep '^Length:' wget-output.log > /dev/stderr
  echo "Unexpected debian package MIME-type!"
  exit 6
fi

# try handing off the actual install so it restarting us doesn't interupt it
if which systemd-run
then systemd-run -d dpkg -i "${PackageFilename}"
else dpkg -i "${PackageFilename}"
fi
