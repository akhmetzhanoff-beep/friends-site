#!/usr/bin/env bash
# Loads courses, book summaries and tests into the database. Safe to run again. Run as root.
set -euo pipefail
cd /opt/friends/app/apps/api
su friends -s /bin/bash -c 'set -a; . /etc/friends/api.env; set +a; npm run seed:learning'
