#!/bin/sh
if [ $1 -eq 0 ] && [ -x /usr/bin/systemctl ] ; then
  # Package removal, not upgrade
  /usr/bin/systemctl --no-reload disable --now conduit-agent.service >/dev/null 2>&1 || :
fi
