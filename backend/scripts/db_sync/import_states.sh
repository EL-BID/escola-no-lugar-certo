#!/bin/bash
#
# Script to copy all states from source to target database.
# Matches states by 'code'.
#
# Usage: ./import_states.sh
#
# Environment variables required (set in .env file):
#   SRC_HOST, SRC_PORT, SRC_DB, SRC_USER
#   TGT_HOST, TGT_PORT, TGT_DB, TGT_USER, TGT_PASS
#
set -euo pipefail

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env"
fi

# Connections
SRC_HOST="${SRC_HOST:-localhost}"
SRC_PORT="${SRC_PORT:-5432}"
SRC_DB="${SRC_DB:-geo_edu_brazil}"
SRC_USER="${SRC_USER:-$(whoami)}"

TGT_HOST="${TGT_HOST:?Error: TGT_HOST not set}"
TGT_PORT="${TGT_PORT:-5432}"
TGT_DB="${TGT_DB:?Error: TGT_DB not set}"
TGT_USER="${TGT_USER:?Error: TGT_USER not set}"
TGT_PASS="${TGT_PASS:?Error: TGT_PASS not set}"

# Cleanup
cleanup() {
  rm -f "/tmp/states_export.csv" 2>/dev/null || true
  rm -f "/tmp/import_states.sql" 2>/dev/null || true
}
trap cleanup EXIT

echo "=========================================="
echo "Importing States..."
echo "=========================================="

# Export from Source
echo "Step 1: Exporting states from source..."
psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -c "
COPY (
  SELECT 
    code,
    name,
    abbrev,
    region,
    code_region,
    total_municipalities,
    created_at,
    updated_at
  FROM states
  ORDER BY code
) TO STDOUT WITH (FORMAT CSV, HEADER, DELIMITER '|')
" > "/tmp/states_export.csv"

COUNT=$(($(wc -l < "/tmp/states_export.csv") - 1))
echo "Found $COUNT states to import."

if [[ "$COUNT" -eq 0 ]]; then
  echo "No states found in source!"
  exit 0
fi

# Import to Target
echo "Step 2: Importing to target..."

cat > "/tmp/import_states.sql" <<EOF
CREATE TEMP TABLE temp_states (
    code text,
    name text,
    abbrev text,
    region text,
    code_region text,
    total_municipalities integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

\COPY temp_states FROM '/tmp/states_export.csv' WITH (FORMAT CSV, HEADER, DELIMITER '|')

INSERT INTO states (
    code,
    name,
    abbrev,
    region,
    code_region,
    total_municipalities,
    created_at,
    updated_at
)
SELECT 
    t.code,
    t.name,
    t.abbrev,
    t.region,
    t.code_region,
    t.total_municipalities,
    t.created_at,
    t.updated_at
FROM temp_states t
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    abbrev = EXCLUDED.abbrev,
    region = EXCLUDED.region,
    code_region = EXCLUDED.code_region,
    total_municipalities = EXCLUDED.total_municipalities,
    updated_at = EXCLUDED.updated_at;

DROP TABLE temp_states;
EOF

PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -f "/tmp/import_states.sql"

echo "✓ States import complete!"
