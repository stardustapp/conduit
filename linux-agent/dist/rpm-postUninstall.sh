#!/bin/sh
if [ $1 -ge 1 ] && [ -x /usr/bin/systemctl ] ; then
  # Package upgrade, not uninstall
  /usr/bin/systemctl try-restart conduit-agent.service >/dev/null 2>&1 || :
fi
