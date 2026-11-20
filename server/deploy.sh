#!/usr/bin/env bash
# Pulls new code, builds, migrates the database and restarts the API. Runs as user "friends" every 2 minutes.
set -euo pipefail
exec 9>/tmp/friends-deploy.lock; flock -n 9 || exit 0
. /etc/friends/deploy.env
APP=/opt/friends/app
if [ ! -d "$APP/.git" ]; then git clone --branch "$BRANCH" --single-branch "$REPO" "$APP"; NEW=1; else NEW=0; fi
cd "$APP"
git fetch --quiet origin "$BRANCH"
if [ "$NEW" = 0 ] && [ "$(git rev-parse HEAD)" = "$(git rev-parse FETCH_HEAD)" ] && [ -f apps/api/dist/server.js ]; then exit 0; fi
git reset --hard FETCH_HEAD
cd apps/api
npm ci --no-audit --no-fund
npm run build
set -a; . /etc/friends/api.env; set +a
node dist/migrate.js
sudo /usr/bin/systemctl restart friends-api
echo "deployed $(git rev-parse --short HEAD) at $(date -u +%FT%TZ)"
