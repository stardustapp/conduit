#!/bin/sh -eux
# TODO: check that package is not held, if apt doesn't

UrlPrefix="https://s3-us-west-2.amazonaws.com/dist.stardustapp.run/"
VersionCode="$1"
SystemType="$2"
GivenUrl="$3"

if [ "${GivenUrl%%$UrlPrefix*}" ]
then
  echo "Given URL '${GivenUrl}' not in trusted prefix '${UrlPrefix}'"
  exit 5
fi

case $SystemType in

  "Rpm")
    # try handing off the actual install so it restarting us doesn't interupt it too
    if which systemd-run
    then systemd-run dnf install -y "${GivenUrl}"
    else dnf install -y "${GivenUrl}"
    fi;;

  "Deb")
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

    # try handing off the actual install so it restarting us doesn't interupt it too
    if which systemd-run
    then systemd-run dpkg -i "$(pwd)/${PackageFilename}"
    else dpkg -i "${PackageFilename}"
    fi;;

  *)
    echo "Bad SystemType given to agent-upgrade.sh!"
    exit 1;;
esac
