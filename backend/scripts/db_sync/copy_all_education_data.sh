#!/bin/bash
#
# Copy education data for all Brazilian states to production
# This script runs copy_education_data_state.sh for each state sequentially
#
# Usage: ./copy_all_education_data.sh
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

# Source database configuration (from environment or defaults)
SRC_HOST="${SRC_HOST:-localhost}"
SRC_PORT="${SRC_PORT:-5432}"
SRC_DB="${SRC_DB:-geo_edu_brazil}"
SRC_USER="${SRC_USER:-$(whoami)}"

echo "========================================="
echo "Copying education data for ALL Brazilian states"
echo "========================================="
echo ""

# Get all state codes
STATE_CODES=$(psql -h "$SRC_HOST" -p "$SRC_PORT" -U "$SRC_USER" "$SRC_DB" -t -c "SELECT code FROM states ORDER BY code;")

# Track success/failure
TOTAL_STATES=0
SUCCESS_STATES=0
FAILED_STATES=()

START_TIME=$(date +%s)

for state_code in $STATE_CODES; do
  ((TOTAL_STATES++))
  
  echo ""
  echo "----------------------------------------"
  echo "Processing state $TOTAL_STATES: code $state_code"
  echo "----------------------------------------"
  
  if ./copy_education_data_state.sh "$state_code"; then
    ((SUCCESS_STATES++))
    echo "✓ State $state_code completed successfully"
  else
    FAILED_STATES+=("$state_code")
    echo "✗ State $state_code failed"
    
    # Ask user if they want to continue
    read -p "Continue with remaining states? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborting..."
      break
    fi
  fi
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo "Total states processed: $TOTAL_STATES"
echo "Successful: $SUCCESS_STATES"
echo "Failed: ${#FAILED_STATES[@]}"
echo "Duration: $DURATION seconds"

if [ ${#FAILED_STATES[@]} -gt 0 ]; then
  echo ""
  echo "Failed states:"
  for state in "${FAILED_STATES[@]}"; do
    echo "  - $state"
  done
fi

echo ""
echo "✓ Batch copy complete!"
