#!/bin/sh -eux
# TODO: check that package is not held, if apt doesn't

UriPrefix="s3-us-west-2.amazonaws.com/dist.stardustapp.run/deb"
VersionCode="$1"

cd "$(mktmp -d)"

wget -O "package.deb" "https://$UriPrefix/conduit-agent_${VersionCode}_all.deb" \
  2> wget-output.log

if ! grep " \[application/x-debian-package\]$" wget-output.log
then
  grep '^Length:' wget-output.log > /dev/stderr
  echo "Unexpected debian package MIME-type!"
  exit 6
fi

dpkg -i package.deb
