#!/usr/bin/env bash
# Run as root on the server: friends-set-sms-key
# Asks for the Mobizon API key (typing is hidden) and stores it only in /etc/friends/api.env.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root"; exit 1; }
read -rsp "Mobizon API key: " KEY; echo
[ -n "$KEY" ] || { echo "Empty key"; exit 1; }
F=/etc/friends/api.env
sed -i '/^SMS_PROVIDER=/d;/^MOBIZON_API_KEY=/d;/^MOBIZON_API_HOST=/d' "$F"
printf 'SMS_PROVIDER=mobizon\nMOBIZON_API_KEY=%s\nMOBIZON_API_HOST=api.mobizon.kz\n' "$KEY" >> "$F"
systemctl restart friends-api
echo "OK: SMS sending is on."
