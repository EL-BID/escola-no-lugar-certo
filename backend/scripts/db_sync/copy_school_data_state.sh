#!/bin/bash
#
# Generalized script to copy school data for any state by state code
#
# Usage: ./copy_school_data_state.sh <state_code>
# Example: ./copy_school_data_state.sh 15  (for Pará)
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
  rm -f "/tmp/state_${STATE_CODE}_school_data_bulk.csv" 2>/dev/null || true
  rm -f /tmp/state_"${STATE_CODE}"_school_chunk_* 2>/dev/null || true
  rm -f "/tmp/import_school_chunk_${STATE_CODE}.sql" 2>/dev/null || true
}

# Ensure cleanup runs on exit (success or failure)
trap cleanup EXIT

echo "=========================================="
echo "Copying school data for state code: $STATE_CODE"
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
EXISTING_COUNT=$(PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -t -c "SELECT COUNT(id) FROM schools WHERE state_id = $TGT_STATE_ID;")
TOTAL_COUNT=$(psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -t -c "SELECT COUNT(id) FROM schools WHERE state_id = $SRC_STATE_ID;")

echo "School records in production: $EXISTING_COUNT"
echo "School records in source: $TOTAL_COUNT"

if [[ "$EXISTING_COUNT" -eq "$TOTAL_COUNT" ]]; then
  echo "✓ All school data already exists in production. Nothing to copy!"
  exit 0
fi

echo -e "\nStep 3: Exporting missing school records..."
psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -c "
COPY (
  SELECT 
    s.code_school,
    s.name_school,
    st.code as state_code,
    m.code_ibge as municipality_code,
    COALESCE(h.h3_index, '') as hexagon_h3_index,
    ST_X(s.geometry::geometry) as longitude,
    ST_Y(s.geometry::geometry) as latitude,
    COALESCE(s.address, '') as address,
    s.urban,
    s.admin_category,
    COALESCE(s.tp_dependencia, 0) as tp_dependencia,
    COALESCE(s.size, '') as size,
    s.qt_salas_utilizadas,
    s.qt_salas_utilizadas_dentro,
    s.qt_salas_utilizadas_fora,
    s.qt_mat_inf_cre,
    s.qt_mat_inf_pre,
    s.qt_mat_fund_ai,
    s.qt_mat_fund_af,
    s.qt_mat_med,
    s.qt_doc_bas,
    s.qt_tur_bas,
    COALESCE(s.ratio_mat_doc_bas, 0) as ratio_mat_doc_bas,
    COALESCE(s.ratio_mat_salas, 0) as ratio_mat_salas,
    s.created_at,
    s.updated_at
  FROM schools s
  JOIN states st ON s.state_id = st.id
  JOIN municipalities m ON s.municipality_id = m.id
  LEFT JOIN hexagons h ON s.hexagon_id = h.id
  WHERE s.state_id = $SRC_STATE_ID
  AND s.code_school NOT IN (
    SELECT code_school FROM dblink(
      'host=$TGT_HOST port=$TGT_PORT dbname=$TGT_DB user=$TGT_USER password=$TGT_PASS',
      'SELECT code_school FROM schools WHERE state_id = $TGT_STATE_ID'
    ) AS t(code_school text)
  )
  ORDER BY s.id
) TO STDOUT WITH (FORMAT CSV, HEADER, DELIMITER '|')
" > "/tmp/state_${STATE_CODE}_school_data_bulk.csv" 2>&1

EXPORT_COUNT=$(($(wc -l < "/tmp/state_${STATE_CODE}_school_data_bulk.csv") - 1))
echo "Exported school records to copy: $EXPORT_COUNT rows"

if [[ "$EXPORT_COUNT" -eq 0 ]]; then
  echo "✓ No new school data to copy!"
  exit 0
fi

echo -e "\nStep 4: Importing to target database..."
split -l 10000 "/tmp/state_${STATE_CODE}_school_data_bulk.csv" "/tmp/state_${STATE_CODE}_school_chunk_"

chunk_num=0
for chunk in /tmp/state_"${STATE_CODE}"_school_chunk_*; do
  ((chunk_num++))
  echo "Importing chunk $chunk_num: $chunk..."
  
  cat > "/tmp/import_school_chunk_${STATE_CODE}.sql" <<EOF
CREATE TEMP TABLE temp_school_data (
  code_school text,
  name_school text,
  state_code text,
  municipality_code text,
  hexagon_h3_index text,
  longitude numeric,
  latitude numeric,
  address text,
  urban boolean,
  admin_category text,
  tp_dependencia integer,
  size text,
  qt_salas_utilizadas integer,
  qt_salas_utilizadas_dentro integer,
  qt_salas_utilizadas_fora integer,
  qt_mat_inf_cre integer,
  qt_mat_inf_pre integer,
  qt_mat_fund_ai integer,
  qt_mat_fund_af integer,
  qt_mat_med integer,
  qt_doc_bas integer,
  qt_tur_bas integer,
  ratio_mat_doc_bas numeric,
  ratio_mat_salas numeric,
  created_at timestamp,
  updated_at timestamp
);

\COPY temp_school_data FROM '$chunk' WITH (FORMAT CSV, HEADER, DELIMITER '|')

INSERT INTO schools (
  code_school,
  name_school,
  state_id,
  municipality_id,
  hexagon_id,
  geometry,
  address,
  urban,
  admin_category,
  tp_dependencia,
  size,
  qt_salas_utilizadas,
  qt_salas_utilizadas_dentro,
  qt_salas_utilizadas_fora,
  qt_mat_inf_cre,
  qt_mat_inf_pre,
  qt_mat_fund_ai,
  qt_mat_fund_af,
  qt_mat_med,
  qt_doc_bas,
  qt_tur_bas,
  ratio_mat_doc_bas,
  ratio_mat_salas,
  created_at,
  updated_at
)
SELECT 
  t.code_school,
  t.name_school,
  st.id,
  m.id,
  h.id,
  ST_SetSRID(ST_MakePoint(t.longitude, t.latitude), 4326),
  t.address,
  t.urban,
  t.admin_category,
  NULLIF(t.tp_dependencia, 0),
  NULLIF(t.size, ''),
  t.qt_salas_utilizadas,
  t.qt_salas_utilizadas_dentro,
  t.qt_salas_utilizadas_fora,
  t.qt_mat_inf_cre,
  t.qt_mat_inf_pre,
  t.qt_mat_fund_ai,
  t.qt_mat_fund_af,
  t.qt_mat_med,
  t.qt_doc_bas,
  t.qt_tur_bas,
  NULLIF(t.ratio_mat_doc_bas, 0),
  NULLIF(t.ratio_mat_salas, 0),
  t.created_at,
  t.updated_at
FROM temp_school_data t
JOIN states st ON st.code = t.state_code
JOIN municipalities m ON m.code_ibge = t.municipality_code
LEFT JOIN hexagons h ON h.h3_index = NULLIF(t.hexagon_h3_index, '')
ON CONFLICT (code_school) DO NOTHING;

DROP TABLE temp_school_data;
EOF
  
  max_retries=3
  retry_count=0
  success=false
  
  while [[ $retry_count -lt $max_retries ]]; do
    if PGPASSWORD="$TGT_PASS" psql -h "$TGT_HOST" -p "$TGT_PORT" -U "$TGT_USER" "$TGT_DB" -f "/tmp/import_school_chunk_${STATE_CODE}.sql"; then
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
