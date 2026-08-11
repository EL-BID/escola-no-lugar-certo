#!/bin/bash
#
# Copy hexagons for all Brazilian states to production IN PARALLEL
# This runs multiple state copies simultaneously for much faster execution
#
# Usage: ./copy_all_states_parallel.sh [max_parallel_jobs]
#
# Environment variables required (set in .env file):
#   SRC_HOST, SRC_PORT, SRC_DB, SRC_USER
#
set -euo pipefail

# Load environment variables from .env if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/.env" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env"
fi

MAX_PARALLEL=${1:-4}  # Default to 4 parallel jobs

# Source database configuration (from environment or defaults)
SRC_HOST="${SRC_HOST:-localhost}"
SRC_PORT="${SRC_PORT:-5432}"
SRC_DB="${SRC_DB:-geo_edu_brazil}"
SRC_USER="${SRC_USER:-$(whoami)}"

echo "========================================="
echo "Copying hexagons for ALL Brazilian states"
echo "Running up to $MAX_PARALLEL states in parallel"
echo "========================================="
echo ""

# Get all state codes
STATE_CODES=$(psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -t -c "SELECT code FROM states ORDER BY code;")

# Create a log directory
LOG_DIR="/tmp/state_copy_logs"
mkdir -p "$LOG_DIR"
rm -f "${LOG_DIR}"/*.log 2>/dev/null || true

START_TIME=$(date +%s)

# Function to run copy for a single state
copy_state_with_log() {
  local state_code=$1
  local log_file="${LOG_DIR}/state_${state_code}.log"
  
  echo "Starting state $state_code..." | tee "$log_file"
  ./copy_state.sh "$state_code" >> "$log_file" 2>&1
  
  if [[ $? -eq 0 ]]; then
    echo "✓ State $state_code completed" | tee -a "$log_file"
    return 0
  else
    echo "✗ State $state_code failed" | tee -a "$log_file"
    return 1
  fi
}

export -f copy_state_with_log
export LOG_DIR

# Run copies in parallel using xargs
echo "$STATE_CODES" | xargs -P "$MAX_PARALLEL" -I {} bash -c 'copy_state_with_log "$@"' _ {}

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Count results
SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_STATES=()

for state_code in $STATE_CODES; do
  log_file="${LOG_DIR}/state_${state_code}.log"
  if grep -q "✓.*completed" "$log_file" 2>/dev/null; then
    ((SUCCESS_COUNT++))
  else
    ((FAILED_COUNT++))
    FAILED_STATES+=("$state_code")
  fi
done

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Total states processed: $((SUCCESS_COUNT + FAILED_COUNT))"
echo "Successful: $SUCCESS_COUNT"
echo "Failed: $FAILED_COUNT"
echo "Duration: $DURATION seconds"
echo "Logs available in: $LOG_DIR"

if [ $FAILED_COUNT -gt 0 ]; then
  echo ""
  echo "Failed states:"
  for state in "${FAILED_STATES[@]}"; do
    echo "  - $state (see $LOG_DIR/state_${state}.log)"
  done
fi

echo ""
echo "✓ Batch copy complete!"
