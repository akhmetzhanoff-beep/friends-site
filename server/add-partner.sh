#!/usr/bin/env bash
# Adds a blogger link to the real database. Safe to run again. Run as root:
#   curl -fsSL https://friendscommunity.kz/server/add-partner.sh | sudo bash -s -- kappas "Азамат Каппас" +77001234567
# The phone is the blogger's own number (they must have signed in once); it opens their cabinet.
set -euo pipefail
CODE="${1:-}"; NAME="${2:-}"; OWNER="${3:-}"
[[ "$CODE" =~ ^[a-z0-9][a-z0-9_-]{1,39}$ ]] && [ -n "$NAME" ] || { echo 'Usage: add-partner.sh code "Name"'; exit 1; }
[ -z "$OWNER" ] || [[ "$OWNER" =~ ^\+[1-9][0-9]{7,14}$ ]] || { echo "Owner phone must look like +77001234567"; exit 1; }
su postgres -c "psql -v ON_ERROR_STOP=1 -v code='$CODE' -v name='$NAME' -v owner='$OWNER' friends" <<'SQL'
INSERT INTO promo_partners (code, name, trial_days, first_bonus_pct, renewal_bonus_pct, renewal_months)
VALUES (:'code', :'name', 30, 20, 10, 12)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'active';
WITH o AS (SELECT id FROM auth_identities WHERE phone = :'owner'),
ou AS (INSERT INTO users (auth_subject) SELECT id::text FROM o ON CONFLICT (auth_subject) DO UPDATE SET updated_at = now() RETURNING id)
UPDATE promo_partners SET owner_user_id = (SELECT id FROM ou) WHERE code = :'code' AND EXISTS (SELECT 1 FROM ou);
SELECT code, name, owner_user_id IS NOT NULL AS owner_linked, trial_days, first_bonus_pct, renewal_bonus_pct FROM promo_partners WHERE code = :'code';
SQL
