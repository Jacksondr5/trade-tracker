#!/bin/bash
# Ralph Single Iteration - Run one coding agent pass
# Usage: ./ralph-iter.sh [--tool amp|claude]
# Output: JSON result on last line for easy parsing

set -e

# Parse arguments
TOOL="claude"

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Validate tool choice
if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo '{"success":false,"complete":false,"error":"Invalid tool. Must be amp or claude"}'
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"

# Get story count before run
TOTAL_STORIES=$(jq '.userStories | length' "$PRD_FILE" 2>/dev/null || echo "0")
PASSING_BEFORE=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo "0")

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# Create temp file for output
TEMP_OUTPUT=$(mktemp)
trap "rm -f $TEMP_OUTPUT" EXIT

echo "=== Ralph Iteration ($TOOL) ===" >&2
echo "Stories: $PASSING_BEFORE / $TOTAL_STORIES passing" >&2
echo "" >&2

# Run the selected tool
EXIT_CODE=0
if [[ "$TOOL" == "amp" ]]; then
  cat "$SCRIPT_DIR/prompt.md" | amp --dangerously-allow-all 2>&1 | tee "$TEMP_OUTPUT" >&2 || EXIT_CODE=$?
else
  claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/prompt.md" 2>&1 | tee "$TEMP_OUTPUT" >&2 || EXIT_CODE=$?
fi

# Get story count after run
PASSING_AFTER=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo "0")
STORIES_COMPLETED=$((PASSING_AFTER - PASSING_BEFORE))

# Check for completion signal
ALL_COMPLETE=false
if grep -q "<promise>COMPLETE</promise>" "$TEMP_OUTPUT"; then
  ALL_COMPLETE=true
fi

# Get last completed story ID (if any progress was made)
LAST_STORY=""
if [ "$STORIES_COMPLETED" -gt 0 ]; then
  # Find the last story that passes
  LAST_STORY=$(jq -r '[.userStories[] | select(.passes == true)] | last | .id // empty' "$PRD_FILE" 2>/dev/null || echo "")
fi

# Get last commit if any
LAST_COMMIT=$(git -C "$SCRIPT_DIR" log -1 --format="%h %s" 2>/dev/null || echo "")

# Determine success
SUCCESS=true
ERROR=""
if [ $EXIT_CODE -ne 0 ]; then
  SUCCESS=false
  ERROR="Tool exited with code $EXIT_CODE"
fi

# Output structured JSON result (this is what the manager parses)
cat << EOF
{"success":$SUCCESS,"complete":$ALL_COMPLETE,"storiesBefore":$PASSING_BEFORE,"storiesAfter":$PASSING_AFTER,"storiesCompleted":$STORIES_COMPLETED,"totalStories":$TOTAL_STORIES,"lastStory":"$LAST_STORY","lastCommit":"$LAST_COMMIT","error":"$ERROR"}
EOF
