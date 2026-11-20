#!/usr/bin/env bash
# Gives a phone number administrator rights and an active year of membership. Safe to run again. Run as root:
#   curl -fsSL https://friendscommunity.kz/server/make-admin.sh | sudo bash -s -- +77001470000
set -euo pipefail
PHONE="${1:-}"
[[ "$PHONE" =~ ^\+[1-9][0-9]{7,14}$ ]] || { echo "Usage: make-admin.sh +77001234567"; exit 1; }
su postgres -c "psql -v ON_ERROR_STOP=1 -v phone='$PHONE' friends" <<'SQL'
WITH ident AS (SELECT id FROM auth_identities WHERE phone = :'phone'),
u AS (
  INSERT INTO users (auth_subject)
  SELECT id::text FROM ident
  ON CONFLICT (auth_subject) DO UPDATE SET updated_at = now()
  RETURNING id
),
r AS (INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM u ON CONFLICT DO NOTHING RETURNING 1),
m AS (
  INSERT INTO memberships (user_id, plan_code, status, starts_at, ends_at)
  SELECT id, 'annual', 'active', now(), now() + interval '1 year' FROM u
  WHERE NOT EXISTS (SELECT 1 FROM memberships x WHERE x.user_id = u.id AND x.status = 'active')
  RETURNING 1
)
SELECT (SELECT count(*) FROM ident) AS phone_found, (SELECT count(*) FROM u) AS user_ok;
SQL
echo "Done. Sign out and sign in again in the app."
