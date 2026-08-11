#!/bin/bash
#
# Script to copy all municipalities from source to target database.
# Matches municipalities by 'state_code' and 'name' (unique_together).
# Resolves state_id dynamically on both sides to handle ID differences.
#
# Usage: ./import_municipalities.sh
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
  rm -f "/tmp/munis_export.csv" 2>/dev/null || true
  rm -f "/tmp/import_munis.sql" 2>/dev/null || true
}
trap cleanup EXIT

echo "=========================================="
echo "Importing Municipalities..."
echo "=========================================="

echo "Step 1: Exporting municipalities from source..."
# Join with states to get the state CODE (invariant), not the ID.
psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -c "
COPY (
  SELECT 
    s.code as state_code,
    m.name,
    m.code_ibge,
    ST_AsEWKT(m.geometry) as geometry,
    ST_AsEWKT(m.centroid) as centroid,
    m.area_km2,
    m.population,
    m.created_at,
    m.updated_at
  FROM municipalities m
  JOIN states s ON m.state_id = s.id
  ORDER BY s.code, m.name
) TO STDOUT WITH (FORMAT CSV, HEADER, DELIMITER '|')
" > "/tmp/munis_export.csv"

COUNT=$(($(wc -l < "/tmp/munis_export.csv") - 1))
echo "Found $COUNT municipalities to import."

if [[ "$COUNT" -eq 0 ]]; then
  echo "No municipalities found in source!"
  exit 0
fi

echo "Step 2: Importing to target..."

cat > "/tmp/import_munis.sql" <<EOF
CREATE TEMP TABLE temp_munis (
    state_code text,
    name text,
    code_ibge text,
    geometry text,
    centroid text,
    area_km2 numeric,
    population integer,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

\COPY temp_munis FROM '/tmp/munis_export.csv' WITH (FORMAT CSV, HEADER, DELIMITER '|')

INSERT INTO municipalities (
    state_id,
    name,
    code_ibge,
    geometry,
    centroid,
    area_km2,
    population,
    created_at,
    updated_at
)
SELECT 
    s.id,
    t.name,
    t.code_ibge,
    ST_GeomFromEWKT(t.geometry),
    ST_GeomFromEWKT(t.centroid),
    t.area_km2,
    t.population,
    t.created_at,
    t.updated_at
FROM temp_munis t
JOIN states s ON s.code = t.state_code
ON CONFLICT (state_id, name) DO UPDATE SET
    code_ibge = EXCLUDED.code_ibge,
    geometry = EXCLUDED.geometry,
    centroid = EXCLUDED.centroid,
    area_km2 = EXCLUDED.area_km2,
    population = EXCLUDED.population,
    updated_at = EXCLUDED.updated_at;

DROP TABLE temp_munis;
EOF

PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -f "/tmp/import_munis.sql"

echo "✓ Municipalities import complete!"
