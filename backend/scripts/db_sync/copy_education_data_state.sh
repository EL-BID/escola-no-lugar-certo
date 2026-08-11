#!/bin/bash
#
# Generalized script to copy education data for any state by state code
#
# Usage: ./copy_education_data_state.sh <state_code>
# Example: ./copy_education_data_state.sh 15  (for Pará)
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
  rm -f "/tmp/state_${STATE_CODE}_edu_data_bulk.csv" 2>/dev/null || true
  rm -f /tmp/state_"${STATE_CODE}"_edu_chunk_* 2>/dev/null || true
  rm -f "/tmp/import_edu_chunk_${STATE_CODE}.sql" 2>/dev/null || true
}

# Ensure cleanup runs on exit (success or failure)
trap cleanup EXIT

echo "=========================================="
echo "Copying education data for state code: $STATE_CODE"
echo "=========================================="

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
EXISTING_COUNT=$(PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -t -c "SELECT COUNT(ed.id) FROM education_data ed JOIN hexagons h ON ed.hexagon_id = h.id WHERE h.state_id = $TGT_STATE_ID;")
TOTAL_COUNT=$(psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -t -c "SELECT COUNT(ed.id) FROM education_data ed JOIN hexagons h ON ed.hexagon_id = h.id WHERE h.state_id = $SRC_STATE_ID;")

echo "Education data records in production: $EXISTING_COUNT"
echo "Education data records in source: $TOTAL_COUNT"

if [[ "$EXISTING_COUNT" -eq "$TOTAL_COUNT" ]]; then
  echo "✓ All education data already exists in production. Nothing to copy!"
  exit 0
fi

echo -e "\nStep 3: Exporting missing education data records..."
psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -c "
COPY (
  SELECT 
    h.h3_index,
    ed.pop_inf_cre,
    ed.pop_inf_pre,
    ed.pop_fund_ai,
    ed.pop_fund_af,
    ed.pop_med,
    ed.qt_mat_inf_cre,
    ed.qt_mat_inf_pre,
    ed.qt_mat_fund_ai,
    ed.qt_mat_fund_af,
    ed.qt_mat_med,
    ed.qt_mat_inf_cre_int,
    ed.qt_mat_inf_pre_int,
    ed.qt_mat_fund_ai_int,
    ed.qt_mat_fund_af_int,
    ed.qt_mat_med_int,
    ed.qt_mat_inf_cre_prop,
    ed.qt_mat_inf_pre_prop,
    ed.qt_mat_fund_ai_prop,
    ed.qt_mat_fund_af_prop,
    ed.qt_mat_med_prop,
    ed.qt_mat_bas_n,
    ed.qt_salas_utilizadas,
    ed.private_qt_mat_inf_cre,
    ed.private_qt_mat_inf_pre,
    ed.private_qt_mat_fund_ai,
    ed.private_qt_mat_fund_af,
    ed.private_qt_mat_med,
    ed.data_year,
    ed.created_at,
    ed.updated_at
  FROM education_data ed
  JOIN hexagons h ON ed.hexagon_id = h.id
  WHERE h.state_id = $SRC_STATE_ID
  AND h.h3_index NOT IN (
    SELECT h3_index FROM dblink(
      'host=$TGT_HOST port=$TGT_PORT dbname=$TGT_DB user=$TGT_USER password=$TGT_PASS',
      'SELECT h.h3_index 
       FROM education_data ed
       JOIN hexagons h ON ed.hexagon_id = h.id
       WHERE h.state_id = $TGT_STATE_ID'
    ) AS t(h3_index text)
  )
  ORDER BY ed.id
) TO STDOUT WITH (FORMAT CSV, HEADER, DELIMITER '|')
" > "/tmp/state_${STATE_CODE}_edu_data_bulk.csv" 2>&1

EXPORT_COUNT=$(($(wc -l < "/tmp/state_${STATE_CODE}_edu_data_bulk.csv") - 1))
echo "Exported education data records to copy: $EXPORT_COUNT rows"

if [[ "$EXPORT_COUNT" -eq 0 ]]; then
  echo "✓ No new education data to copy!"
  exit 0
fi

echo -e "\nStep 4: Importing to target database..."
split -l 100000 "/tmp/state_${STATE_CODE}_edu_data_bulk.csv" "/tmp/state_${STATE_CODE}_edu_chunk_"

chunk_num=0
for chunk in /tmp/state_"${STATE_CODE}"_edu_chunk_*; do
  ((chunk_num++))
  echo "Importing chunk $chunk_num: $chunk..."
  
  cat > "/tmp/import_edu_chunk_${STATE_CODE}.sql" <<EOF
CREATE TEMP TABLE temp_edu_data (
  h3_index text,
  pop_inf_cre numeric,
  pop_inf_pre numeric,
  pop_fund_ai numeric,
  pop_fund_af numeric,
  pop_med numeric,
  qt_mat_inf_cre integer,
  qt_mat_inf_pre integer,
  qt_mat_fund_ai integer,
  qt_mat_fund_af integer,
  qt_mat_med integer,
  qt_mat_inf_cre_int integer,
  qt_mat_inf_pre_int integer,
  qt_mat_fund_ai_int integer,
  qt_mat_fund_af_int integer,
  qt_mat_med_int integer,
  qt_mat_inf_cre_prop numeric,
  qt_mat_inf_pre_prop numeric,
  qt_mat_fund_ai_prop numeric,
  qt_mat_fund_af_prop numeric,
  qt_mat_med_prop numeric,
  qt_mat_bas_n integer,
  qt_salas_utilizadas integer,
  private_qt_mat_inf_cre integer,
  private_qt_mat_inf_pre integer,
  private_qt_mat_fund_ai integer,
  private_qt_mat_fund_af integer,
  private_qt_mat_med integer,
  data_year integer,
  created_at timestamp,
  updated_at timestamp
);

\COPY temp_edu_data FROM '$chunk' WITH (FORMAT CSV, HEADER, DELIMITER '|')

INSERT INTO education_data (
  hexagon_id,
  pop_inf_cre,
  pop_inf_pre,
  pop_fund_ai,
  pop_fund_af,
  pop_med,
  qt_mat_inf_cre,
  qt_mat_inf_pre,
  qt_mat_fund_ai,
  qt_mat_fund_af,
  qt_mat_med,
  qt_mat_inf_cre_int,
  qt_mat_inf_pre_int,
  qt_mat_fund_ai_int,
  qt_mat_fund_af_int,
  qt_mat_med_int,
  qt_mat_inf_cre_prop,
  qt_mat_inf_pre_prop,
  qt_mat_fund_ai_prop,
  qt_mat_fund_af_prop,
  qt_mat_med_prop,
  qt_mat_bas_n,
  qt_salas_utilizadas,
  private_qt_mat_inf_cre,
  private_qt_mat_inf_pre,
  private_qt_mat_fund_ai,
  private_qt_mat_fund_af,
  private_qt_mat_med,
  data_year,
  created_at,
  updated_at
)
SELECT 
  h.id,
  t.pop_inf_cre,
  t.pop_inf_pre,
  t.pop_fund_ai,
  t.pop_fund_af,
  t.pop_med,
  t.qt_mat_inf_cre,
  t.qt_mat_inf_pre,
  t.qt_mat_fund_ai,
  t.qt_mat_fund_af,
  t.qt_mat_med,
  t.qt_mat_inf_cre_int,
  t.qt_mat_inf_pre_int,
  t.qt_mat_fund_ai_int,
  t.qt_mat_fund_af_int,
  t.qt_mat_med_int,
  t.qt_mat_inf_cre_prop,
  t.qt_mat_inf_pre_prop,
  t.qt_mat_fund_ai_prop,
  t.qt_mat_fund_af_prop,
  t.qt_mat_med_prop,
  t.qt_mat_bas_n,
  t.qt_salas_utilizadas,
  t.private_qt_mat_inf_cre,
  t.private_qt_mat_inf_pre,
  t.private_qt_mat_fund_ai,
  t.private_qt_mat_fund_af,
  t.private_qt_mat_med,
  t.data_year,
  t.created_at,
  t.updated_at
FROM temp_edu_data t
JOIN hexagons h ON h.h3_index = t.h3_index
ON CONFLICT (hexagon_id) DO NOTHING;

DROP TABLE temp_edu_data;
EOF
  
  max_retries=3
  retry_count=0
  success=false
  
  while [[ $retry_count -lt $max_retries ]]; do
    if PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -f "/tmp/import_edu_chunk_${STATE_CODE}.sql"; then
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
