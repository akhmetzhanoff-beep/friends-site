#!/usr/bin/env bash
# Friends API server setup (Ubuntu 24.04). Safe to run again. Run as root:
#   curl -fsSL https://friendscommunity.kz/server/bootstrap.sh | bash
# It contains no secrets: passwords are generated on this server and kept in /etc/friends.
set -euo pipefail

DOMAIN="${DOMAIN:-api.friendscommunity.kz}"
REPO="${REPO:-git@github.com:akhmetzhanoff-beep/friends-hub.git}"
BRANCH="${BRANCH:-claude/modest-ride-dmwxlb}"
SITE="https://friendscommunity.kz"

echo "== 1/8 Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git nginx postgresql postgresql-contrib certbot python3-certbot-nginx ufw fail2ban openssl unattended-upgrades
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== 2/8 User and folders"
id friends >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/friends --shell /bin/bash friends
mkdir -p /opt/friends /etc/friends /var/backups/friends
chown friends:friends /opt/friends

echo "== 3/8 Database"
systemctl enable --now postgresql
if [ ! -f /etc/friends/api.env ]; then
  DBPASS="$(openssl rand -hex 24)"
  su postgres -c "psql -v ON_ERROR_STOP=1" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'friends') THEN CREATE ROLE friends LOGIN PASSWORD '${DBPASS}'; END IF;
END \$\$;
SQL
  su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='friends'\" | grep -q 1 || createdb -O friends friends"
  cat > /etc/friends/api.env <<ENV
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=1
LOG_LEVEL=info
DATABASE_URL=postgres://friends:${DBPASS}@127.0.0.1:5432/friends
AUTH_JWT_SECRET=$(openssl rand -hex 32)
SMS_PROVIDER=log
CORS_ALLOWED_ORIGINS=https://friendscommunity.kz,https://www.friendscommunity.kz,capacitor://localhost,https://localhost
ENV
fi
chown root:friends /etc/friends/api.env && chmod 640 /etc/friends/api.env
cat > /etc/friends/deploy.env <<ENV
REPO=${REPO}
BRANCH=${BRANCH}
ENV

echo "== 4/8 Deploy key (read-only access to the code)"
install -d -m 700 -o friends -g friends /home/friends/.ssh
if [ ! -f /home/friends/.ssh/id_ed25519 ]; then
  su friends -c "ssh-keygen -t ed25519 -N '' -C friends-api-deploy -f /home/friends/.ssh/id_ed25519" >/dev/null
fi
su friends -c "ssh-keyscan -t ed25519 github.com >> /home/friends/.ssh/known_hosts 2>/dev/null; sort -u /home/friends/.ssh/known_hosts -o /home/friends/.ssh/known_hosts"

echo "== 5/8 Deploy script and services"
curl -fsSL "$SITE/server/deploy.sh" -o /usr/local/bin/friends-deploy
curl -fsSL "$SITE/server/set-sms-key.sh" -o /usr/local/bin/friends-set-sms-key
chmod 755 /usr/local/bin/friends-deploy /usr/local/bin/friends-set-sms-key
echo 'friends ALL=(root) NOPASSWD: /usr/bin/systemctl restart friends-api' > /etc/sudoers.d/friends-deploy
chmod 440 /etc/sudoers.d/friends-deploy

cat > /etc/systemd/system/friends-api.service <<'UNIT'
[Unit]
Description=Friends API
After=network.target postgresql.service
[Service]
User=friends
WorkingDirectory=/opt/friends/app/apps/api
EnvironmentFile=/etc/friends/api.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/friends-deploy.service <<'UNIT'
[Unit]
Description=Friends API deploy (pull, build, migrate, restart)
[Service]
Type=oneshot
User=friends
ExecStart=/usr/local/bin/friends-deploy
UNIT
cat > /etc/systemd/system/friends-deploy.timer <<'UNIT'
[Unit]
Description=Check for new Friends API code every 2 minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable friends-api >/dev/null 2>&1
systemctl enable --now friends-deploy.timer

echo "== 6/8 Web server and HTTPS"
cat > /etc/nginx/sites-available/friends-api <<NGINX
server {
  listen 80;
  server_name ${DOMAIN};
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 60s;
  }
}
NGINX
ln -sf /etc/nginx/sites-available/friends-api /etc/nginx/sites-enabled/friends-api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
if ! certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect; then
  echo "!! HTTPS certificate was not issued (the DNS record may still be spreading). Run this script again in 10 minutes."
fi

echo "== 7/8 Firewall, protection, backups"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null 2>&1
cat > /etc/cron.daily/friends-backup <<'CRON'
#!/bin/sh
su postgres -c "pg_dump friends" | gzip > /var/backups/friends/friends-$(date +%F).sql.gz
find /var/backups/friends -name '*.sql.gz' -mtime +14 -delete
CRON
chmod 755 /etc/cron.daily/friends-backup

echo "== 8/8 First deploy attempt"
su friends -c /usr/local/bin/friends-deploy || echo "(the code will be pulled automatically once the deploy key is added on GitHub)"

echo
echo "=============================================================="
echo " DONE. Add this deploy key on GitHub (Settings > Deploy keys,"
echo " leave 'Allow write access' OFF):"
echo
cat /home/friends/.ssh/id_ed25519.pub
echo "=============================================================="
