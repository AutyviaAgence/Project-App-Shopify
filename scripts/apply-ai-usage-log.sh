#!/usr/bin/env bash
# Applique la migration ai_usage_log sur la DB prod via le tunnel SSH.
# Usage :
#   1) Ouvre le tunnel dans un terminal :
#        ssh -N -L 5435:127.0.0.1:5434 ubuntu@92.222.178.93
#   2) Dans un autre terminal, lance ce script :
#        bash scripts/apply-ai-usage-log.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGPASSWORD='xpndqb1t4oli7q1mxu65cep6amcdgpqd' \
  psql -h 127.0.0.1 -p 5435 -U postgres -d postgres \
  -f "$DIR/supabase/migrations/20260702_ai_usage_log.sql"

echo "OK — table ai_usage_log créée."
