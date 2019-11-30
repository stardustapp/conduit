#!/bin/sh
set -e
# this file is based on mongod's postinst

case "$1" in
    configure)
        # create a conduit group and user
        if ! getent passwd conduit >/dev/null; then
                adduser --system --disabled-password --disabled-login \
                        --home /opt/conduit-agent --no-create-home \
                        --quiet --group conduit
        fi

        # allow directly managing wireguard configs
        if ! dpkg-statoverride --list "/etc/wireguard" >/dev/null 2>&1; then
                dpkg-statoverride --update --add root conduit 0775 "/etc/wireguard"
        fi
        if [ -d /etc/wireguard ]; then
                chown -R :conduit /etc/wireguard
                chmod -R g+rw /etc/wireguard
        fi
    ;;

    abort-upgrade|abort-remove|abort-deconfigure)
    ;;

    *)
        echo "postinst called with unknown argument \`$1'" >&2
        exit 1
    ;;
esac

# Automatically added by dh_installsystemd/11.1.6ubuntu2
if [ "$1" = "configure" ] || [ "$1" = "abort-upgrade" ] || [ "$1" = "abort-deconfigure" ] || [ "$1" = "abort-remove" ] ; then
        # This will only remove masks created by d-s-h on package removal.
        deb-systemd-helper unmask 'conduit-agent.service' >/dev/null || true

        # was-enabled defaults to true, so new installations run enable.
        if deb-systemd-helper --quiet was-enabled 'conduit-agent.service'; then
                # Enables the unit on first installation, creates new
                # symlinks on upgrades if the unit file has changed.
                deb-systemd-helper enable 'conduit-agent.service' >/dev/null || true
                systemctl daemon-reload && systemctl restart 'conduit-agent.service' || true
        else
                # Update the statefile to add new symlinks (if any), which need to be
                # cleaned up on purge. Also remove old symlinks.
                deb-systemd-helper update-state 'conduit-agent.service' >/dev/null || true
        fi
fi
# End automatically added section

exit 0
