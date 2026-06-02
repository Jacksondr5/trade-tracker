#!/usr/bin/env bash
set -euo pipefail

# Classify AI review comments using Codex CLI with gpt-5.3-codex-spark.
#
# Usage:
#   ./scripts/classify-reviews/classify.sh [--limit N] [--batch-size N]
#
# Prerequisites:
#   1. Run: npx tsx scripts/classify-reviews/prepare-comments.ts [--limit N]
#   2. Ensure codex CLI is authenticated

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="output/review-analysis"
PREPARED="$OUTPUT_DIR/prepared-comments.json"
SCHEMA="$SCRIPT_DIR/output-schema.json"
CLASSIFIED="$OUTPUT_DIR/classified-comments.json"
BATCH_DIR="$OUTPUT_DIR/batches"

MODEL="gpt-5.3-codex-spark"
BATCH_SIZE=10

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --batch-size) BATCH_SIZE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ ! -f "$PREPARED" ]]; then
  echo "ERROR: $PREPARED not found. Run prepare-comments.ts first."
  exit 1
fi

TOTAL=$(jq 'length' "$PREPARED")
echo "==> Classifying $TOTAL comments in batches of $BATCH_SIZE using $MODEL"

mkdir -p "$BATCH_DIR"

# Split into batches
BATCH_NUM=0
for ((i = 0; i < TOTAL; i += BATCH_SIZE)); do
  BATCH_NUM=$((BATCH_NUM + 1))
  BATCH_FILE="$BATCH_DIR/batch-${BATCH_NUM}.json"
  RESULT_FILE="$BATCH_DIR/result-${BATCH_NUM}.json"

  # Skip if already classified
  if [[ -f "$RESULT_FILE" ]]; then
    echo "  Batch $BATCH_NUM: already classified, skipping"
    continue
  fi

  jq ".[$i:$((i + BATCH_SIZE))]" "$PREPARED" > "$BATCH_FILE"
  BATCH_COUNT=$(jq 'length' "$BATCH_FILE")

  echo "  Batch $BATCH_NUM ($BATCH_COUNT comments, indices $i-$((i + BATCH_SIZE - 1)))..."

  # Build the prompt with the batch of comments
  PROMPT=$(cat <<'PROMPT_TEMPLATE'
You are an expert code reviewer analyst. Classify each AI code review comment below.

## Categories (pick exactly one per comment):
- bug: Logic/runtime error producing wrong behavior
- performance: Query fan-out, scaling concerns
- design-system: Color token / styling rule violations per design docs
- accessibility: ARIA, semantic HTML, assistive tech concerns
- convention: dataTestId, component reuse, coding standard violations
- test-quality: Flaky tests, environment scope, assertion robustness
- data-integrity: Orphaned data, stale references, idempotency gaps
- ux-behavior: Layout jumps, state edge cases, display format changes
- pre-existing: Issue in surrounding code, not introduced by this PR
- informational: Describes what code does; no actionable suggestion
- self-resolution: Follow-up confirming a prior finding was fixed or wrong
- meta: Learning acknowledgments, bot replies to humans

## Scoring (1-5 each):
- correctness: Is the feedback factually accurate? 1=wrong, 5=completely correct
- actionability: Can the developer act on it? 1=vague/no action, 5=specific fix with code
- severity: How important is the issue? 1=trivial, 5=critical bug/security

## Comments to classify:
PROMPT_TEMPLATE
  )

  # Append each comment from the batch
  COMMENTS_TEXT=$(jq -r '.[] | "### Comment \(.id) [\(.reviewer)] on PR #\(.pr_number): \(.pr_title)\nFile: \(.path // "N/A")\n\nDiff context:\n```\n\(.diff_hunk // "N/A")\n```\n\nComment body:\n\(.body)\n\n---\n"' "$BATCH_FILE")

  FULL_PROMPT="${PROMPT}
${COMMENTS_TEXT}

Classify every comment above. Return JSON matching the output schema with a 'classifications' array. Each entry must have: comment_id, category, correctness, actionability, severity, reasoning."

  # Call codex exec
  echo "$FULL_PROMPT" | codex exec \
    --model "$MODEL" \
    --output-schema "$SCHEMA" \
    --output-last-message "$RESULT_FILE" \
    --full-auto \
    --ephemeral \
    - 2>/dev/null

  if [[ -f "$RESULT_FILE" ]]; then
    CLASSIFIED_COUNT=$(jq '.classifications | length' "$RESULT_FILE" 2>/dev/null || echo "0")
    echo "    -> Classified $CLASSIFIED_COUNT comments"
  else
    echo "    -> WARNING: No result file produced"
  fi
done

# Merge all results
echo "==> Merging results..."
jq -s '[.[].classifications] | add' "$BATCH_DIR"/result-*.json > "$CLASSIFIED"

FINAL_COUNT=$(jq 'length' "$CLASSIFIED")
echo "==> Done! $FINAL_COUNT classifications saved to $CLASSIFIED"
