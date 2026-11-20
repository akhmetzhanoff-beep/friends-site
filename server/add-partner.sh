#!/usr/bin/env bash
# Adds a blogger link to the real database. Safe to run again. Run as root:
#   curl -fsSL https://friendscommunity.kz/server/add-partner.sh | sudo bash -s -- kappas "Азамат Каппас"
set -euo pipefail
CODE="${1:-}"; NAME="${2:-}"
[[ "$CODE" =~ ^[a-z0-9][a-z0-9_-]{1,39}$ ]] && [ -n "$NAME" ] || { echo 'Usage: add-partner.sh code "Name"'; exit 1; }
su postgres -c "psql -v ON_ERROR_STOP=1 -v code='$CODE' -v name='$NAME' friends" <<'SQL'
INSERT INTO promo_partners (code, name, trial_days, first_bonus_pct, renewal_bonus_pct, renewal_months)
VALUES (:'code', :'name', 30, 20, 10, 12)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, status = 'active';
SELECT code, name, trial_days, first_bonus_pct, renewal_bonus_pct FROM promo_partners WHERE code = :'code';
SQL
