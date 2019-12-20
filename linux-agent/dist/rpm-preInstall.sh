#!/bin/sh
getent group conduit >/dev/null || groupadd -r conduit
getent passwd conduit >/dev/null || \
  useradd -r -g conduit -d /opt/conduit-agent -s /sbin/nologin \
  -c "Account for Conduit's agent to run as" conduit

if [ -d /etc/wireguard ]; then
  chown -R :conduit /etc/wireguard
  chmod -R g+rw /etc/wireguard
fi
