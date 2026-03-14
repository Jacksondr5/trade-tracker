#!/usr/bin/env bash
set -euo pipefail

# Fetch PR review data from GitHub for AI code review analysis.
# Saves raw data per PR and generates a summary index.

REPO="jacksondr5/trade-tracker"
OUTPUT_DIR="output/review-analysis"
RAW_DIR="$OUTPUT_DIR/raw"

# Known AI reviewer accounts (lowercase for matching)
AI_REVIEWERS=("coderabbitai" "devin-ai-integration[bot]" "devon" "copilot" "github-actions[bot]")

mkdir -p "$RAW_DIR"

echo "==> Fetching PR list from $REPO..."

# Fetch all PRs (open + closed) with pagination
gh api "repos/$REPO/pulls?state=all&per_page=100" --paginate \
  | jq -s 'add' \
  > "$RAW_DIR/_all_prs.json"

TOTAL_PRS=$(jq 'length' "$RAW_DIR/_all_prs.json")
echo "==> Found $TOTAL_PRS PRs"

# Build a lightweight index of PRs
jq '[.[] | {number, title, state, user: .user.login, created_at, updated_at, merged_at, html_url}]' \
  "$RAW_DIR/_all_prs.json" > "$OUTPUT_DIR/pr-index.json"

echo "==> Fetching review data for each PR..."

for PR_NUM in $(jq '.[].number' "$RAW_DIR/_all_prs.json"); do
  PR_FILE="$RAW_DIR/pr-${PR_NUM}.json"

  echo "  PR #${PR_NUM}..."

  # Extract PR metadata from the already-fetched list
  PR_META=$(jq ".[] | select(.number == $PR_NUM) | {number, title, state, body, user: .user.login, created_at, updated_at, merged_at, html_url}" "$RAW_DIR/_all_prs.json")

  # Fetch review comments (line-level), issue comments (general), and reviews
  # Using --paginate for each to handle large PRs
  REVIEW_COMMENTS=$(gh api "repos/$REPO/pulls/$PR_NUM/comments?per_page=100" --paginate 2>/dev/null | jq -s 'add // []')
  ISSUE_COMMENTS=$(gh api "repos/$REPO/issues/$PR_NUM/comments?per_page=100" --paginate 2>/dev/null | jq -s 'add // []')
  REVIEWS=$(gh api "repos/$REPO/pulls/$PR_NUM/reviews?per_page=100" --paginate 2>/dev/null | jq -s 'add // []')

  # Filter AI reviewer comments
  AI_PATTERN=$(printf '%s\n' "${AI_REVIEWERS[@]}" | jq -R . | jq -s 'join("|")')
  AI_REVIEW_COMMENTS=$(echo "$REVIEW_COMMENTS" | jq --argjson pattern "$AI_PATTERN" '[.[] | select(.user.login | test($pattern; "i"))]')
  AI_ISSUE_COMMENTS=$(echo "$ISSUE_COMMENTS" | jq --argjson pattern "$AI_PATTERN" '[.[] | select(.user.login | test($pattern; "i"))]')
  AI_REVIEWS=$(echo "$REVIEWS" | jq --argjson pattern "$AI_PATTERN" '[.[] | select(.user.login | test($pattern; "i"))]')

  # Combine into a single file
  jq -n \
    --argjson meta "$PR_META" \
    --argjson review_comments "$REVIEW_COMMENTS" \
    --argjson issue_comments "$ISSUE_COMMENTS" \
    --argjson reviews "$REVIEWS" \
    --argjson ai_review_comments "$AI_REVIEW_COMMENTS" \
    --argjson ai_issue_comments "$AI_ISSUE_COMMENTS" \
    --argjson ai_reviews "$AI_REVIEWS" \
    '{
      meta: $meta,
      all_review_comments: $review_comments,
      all_issue_comments: $issue_comments,
      all_reviews: $reviews,
      ai_review_comments: $ai_review_comments,
      ai_issue_comments: $ai_issue_comments,
      ai_reviews: $ai_reviews
    }' > "$PR_FILE"
done

echo "==> Generating summary report..."

# Build summary.json by scanning all per-PR files
python3 -c "
import json, glob, os
from collections import defaultdict

output_dir = '$OUTPUT_DIR'
raw_dir = '$RAW_DIR'

pr_files = sorted(glob.glob(os.path.join(raw_dir, 'pr-*.json')))

total_prs = len(pr_files)
comments_per_reviewer = defaultdict(int)
prs_per_reviewer = defaultdict(set)

for pf in pr_files:
    with open(pf) as f:
        data = json.load(f)
    pr_num = data['meta']['number']

    # Count all comments (review comments + issue comments + review bodies)
    for section in ['ai_review_comments', 'ai_issue_comments']:
        for c in data.get(section, []):
            user = c.get('user', {}).get('login', 'unknown')
            comments_per_reviewer[user] += 1
            prs_per_reviewer[user].add(pr_num)

    for r in data.get('ai_reviews', []):
        user = r.get('user', {}).get('login', 'unknown')
        # Only count reviews that have a body (non-empty)
        if r.get('body', '').strip():
            comments_per_reviewer[user] += 1
        prs_per_reviewer[user].add(pr_num)

summary = {
    'total_prs_analyzed': total_prs,
    'comments_per_reviewer': dict(comments_per_reviewer),
    'prs_per_reviewer': {k: sorted(v) for k, v in prs_per_reviewer.items()},
}

with open(os.path.join(output_dir, 'summary.json'), 'w') as f:
    json.dump(summary, f, indent=2)

print(json.dumps(summary, indent=2))
"

echo ""
echo "==> Done! Data saved to $OUTPUT_DIR/"
echo "    - Per-PR raw data: $RAW_DIR/pr-<num>.json"
echo "    - PR index: $OUTPUT_DIR/pr-index.json"
echo "    - Summary: $OUTPUT_DIR/summary.json"
