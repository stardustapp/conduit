#!/bin/sh
if [ $1 -eq 1 ] && [ -x /usr/bin/systemctl ] ; then
  # Initial installation
  /usr/bin/systemctl enable --now conduit-agent.service >/dev/null 2>&1 || :
fi
