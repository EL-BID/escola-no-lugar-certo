#!/bin/bash
#
# Generalized script to copy hexagons for any state by state code
#
# Usage: ./copy_state.sh <state_code>
# Example: ./copy_state.sh 15  (for Pará)
#
# Environment variables required (set in .env file):
#   SRC_HOST, SRC_PORT, SRC_DB, SRC_USER
#   TGT_HOST, TGT_PORT, TGT_DB, TGT_USER, TGT_PASS
#
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <state_code>"
  echo "Example: $0 15  (for Pará)"
  exit 1
fi

STATE_CODE="$1"

# Load environment variables from .env if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env"
fi

# Source database configuration (from environment or defaults)
SRC_HOST="${SRC_HOST:-localhost}"
SRC_PORT="${SRC_PORT:-5432}"
SRC_DB="${SRC_DB:-geo_edu_brazil}"
SRC_USER="${SRC_USER:-$(whoami)}"

# Target database configuration (from environment - required)
TGT_HOST="${TGT_HOST:?Error: TGT_HOST not set. Please configure .env file}"
TGT_PORT="${TGT_PORT:-5432}"
TGT_DB="${TGT_DB:?Error: TGT_DB not set. Please configure .env file}"
TGT_USER="${TGT_USER:?Error: TGT_USER not set. Please configure .env file}"
TGT_PASS="${TGT_PASS:?Error: TGT_PASS not set. Please configure .env file}"

# Cleanup function to remove temporary files
cleanup() {
  rm -f "/tmp/state_${STATE_CODE}_hexagons_bulk.csv" 2>/dev/null || true
  rm -f /tmp/state_"${STATE_CODE}"_chunk_* 2>/dev/null || true
  rm -f "/tmp/import_chunk_${STATE_CODE}.sql" 2>/dev/null || true
}

# Ensure cleanup runs on exit (success or failure)
trap cleanup EXIT

echo "========================================"
echo "Copying hexagons for state code: $STATE_CODE"
echo "========================================"

echo "Step 1: Getting state IDs and names..."
SRC_STATE_INFO=$(psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -t -c "SELECT id, name FROM states WHERE code = '$STATE_CODE';")
SRC_STATE_ID=$(echo "$SRC_STATE_INFO" | awk '{print $1}')
SRC_STATE_NAME=$(echo "$SRC_STATE_INFO" | cut -d' ' -f2-)

TGT_STATE_INFO=$(PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -t -c "SELECT id, name FROM states WHERE code = '$STATE_CODE';")
TGT_STATE_ID=$(echo "$TGT_STATE_INFO" | awk '{print $1}')

if [[ -z "$SRC_STATE_ID" ]] || [[ -z "$TGT_STATE_ID" ]]; then
  echo "✗ State with code '$STATE_CODE' not found in source or target database"
  exit 1
fi

echo "State: $SRC_STATE_NAME (Code: $STATE_CODE)"
echo "Source state ID: $SRC_STATE_ID"
echo "Target state ID: $TGT_STATE_ID"

echo -e "\nStep 2: Checking what needs to be copied..."
EXISTING_COUNT=$(PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -t -c "SELECT COUNT(*) FROM hexagons WHERE state_id = $TGT_STATE_ID;")
TOTAL_COUNT=$(psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -t -c "SELECT COUNT(*) FROM hexagons WHERE state_id = $SRC_STATE_ID;")

echo "Hexagons in production: $EXISTING_COUNT"
echo "Hexagons in source: $TOTAL_COUNT"

if [[ "$EXISTING_COUNT" -eq "$TOTAL_COUNT" ]]; then
  echo "✓ All hexagons already exist in production. Nothing to copy!"
  exit 0
fi

echo -e "\nStep 3: Exporting missing hexagons..."
psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -c "
COPY (
  SELECT 
    h3_index,
    resolution,
    $TGT_STATE_ID as state_id,
    ST_AsEWKT(geometry) as geometry,
    ST_AsEWKT(centroid) as centroid,
    area_km2,
    municipality_id,
    created_at
  FROM hexagons
  WHERE state_id = $SRC_STATE_ID
  AND h3_index NOT IN (
    SELECT h3_index FROM dblink(
      'host=$TGT_HOST port=$TGT_PORT dbname=$TGT_DB user=$TGT_USER password=$TGT_PASS',
      'SELECT h3_index FROM hexagons WHERE state_id = $TGT_STATE_ID'
    ) AS t(h3_index text)
  )
  ORDER BY id
) TO STDOUT WITH (FORMAT CSV, HEADER, DELIMITER '|')
" > "/tmp/state_${STATE_CODE}_hexagons_bulk.csv" 2>&1

EXPORT_COUNT=$(($(wc -l < "/tmp/state_${STATE_CODE}_hexagons_bulk.csv") - 1))
echo "Exported hexagons to copy: $EXPORT_COUNT rows"

if [[ "$EXPORT_COUNT" -eq 0 ]]; then
  echo "✓ No new hexagons to copy!"
  exit 0
fi

echo -e "\nStep 4: Importing to target database..."
split -l 10000 "/tmp/state_${STATE_CODE}_hexagons_bulk.csv" "/tmp/state_${STATE_CODE}_chunk_"

chunk_num=0
for chunk in /tmp/state_"${STATE_CODE}"_chunk_*; do
  ((chunk_num++))
  echo "Importing chunk $chunk_num: $chunk..."
  
  cat > "/tmp/import_chunk_${STATE_CODE}.sql" <<EOF
CREATE TEMP TABLE temp_hex (
  h3_index text,
  resolution int,
  state_id int,
  geometry text,
  centroid text,
  area_km2 numeric,
  municipality_id int,
  created_at timestamp
);

\COPY temp_hex FROM '$chunk' WITH (FORMAT CSV, HEADER, DELIMITER '|')

INSERT INTO hexagons (h3_index, resolution, state_id, geometry, centroid, area_km2, municipality_id, created_at)
SELECT 
  h3_index,
  resolution,
  state_id,
  ST_GeomFromEWKT(geometry),
  ST_GeomFromEWKT(centroid),
  area_km2,
  municipality_id,
  created_at
FROM temp_hex
ON CONFLICT (h3_index) DO NOTHING;

DROP TABLE temp_hex;
EOF
  
  max_retries=3
  retry_count=0
  success=false
  
  while [[ $retry_count -lt $max_retries ]]; do
    if PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -f "/tmp/import_chunk_${STATE_CODE}.sql"; then
      echo "✓ Imported chunk $chunk_num"
      success=true
      break
    else
      ((retry_count++))
      if [[ $retry_count -lt $max_retries ]]; then
        echo "⚠ Retry $retry_count/$max_retries for chunk $chunk_num (SSL connection lost)..."
        sleep 2
      fi
    fi
  done
  
  if [[ "$success" = false ]]; then
    echo "✗ Failed to import chunk $chunk_num after $max_retries attempts"
    exit 1
  fi
done

echo -e "\n✓ Import complete for $SRC_STATE_NAME!"
