#!/bin/sh
set -e

# I'm going off a stackoverflow answer on what the arguments are here.
case "$1" in
    install|upgrade)

        # writable location for systemd units, like podman containers
        if ! dpkg-statoverride --list "/opt/conduit-agent/unit-files" >/dev/null 2>&1; then
                dpkg-statoverride --update --add root conduit 0575 "/opt/conduit-agent/unit-files"
        fi
    ;;

    abort-upgrade)
    ;;

    *)
        echo "preinst called with unknown argument \`$1'" >&2
        exit 1
    ;;
esac

exit 0
