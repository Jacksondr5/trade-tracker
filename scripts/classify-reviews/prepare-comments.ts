/**
 * Extract AI review comments from raw PR data and prepare them for classification.
 * Outputs a single JSON file with all comments ready for batch classification.
 *
 * Usage: npx tsx scripts/classify-reviews/prepare-comments.ts [--limit N]
 */

import * as fs from "fs";
import * as path from "path";

const RAW_DIR = path.resolve("output/review-analysis/raw");
const OUTPUT_DIR = path.resolve("output/review-analysis");

interface Comment {
  id: string;
  pr_number: number;
  pr_title: string;
  reviewer: string;
  source: "review_comment" | "issue_comment" | "review";
  body: string;
  diff_hunk?: string;
  path?: string;
}

function isWalkthroughOrSummary(body: string): boolean {
  // CodeRabbit posts long summary/walkthrough comments as issue comments
  const markers = [
    "## Walkthrough",
    "## Summary by CodeRabbit",
    "<!-- This is an auto-generated comment",
    "## Walkthrough\n",
    '<img src="https://coderabbit.ai',
  ];
  return markers.some((m) => body.includes(m));
}

function isThinReview(body: string): boolean {
  // Skip reviews with no meaningful body (empty or just whitespace)
  return !body || body.trim().length === 0;
}

const limitArg = process.argv.indexOf("--limit");
const limit =
  limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

const prFiles = fs
  .readdirSync(RAW_DIR)
  .filter((f) => f.match(/^pr-\d+\.json$/))
  .sort((a, b) => {
    const numA = parseInt(a.match(/\d+/)![0], 10);
    const numB = parseInt(b.match(/\d+/)![0], 10);
    return numA - numB;
  });

const allComments: Comment[] = [];

for (const file of prFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, file), "utf-8"));
  const prNum = data.meta.number;
  const prTitle = data.meta.title;

  // AI review comments (line-level)
  for (const c of data.ai_review_comments || []) {
    allComments.push({
      id: `rc-${c.id}`,
      pr_number: prNum,
      pr_title: prTitle,
      reviewer: c.user.login,
      source: "review_comment",
      body: c.body,
      diff_hunk: c.diff_hunk,
      path: c.path,
    });
  }

  // AI issue comments (skip walkthroughs/summaries)
  for (const c of data.ai_issue_comments || []) {
    if (isWalkthroughOrSummary(c.body)) continue;
    allComments.push({
      id: `ic-${c.id}`,
      pr_number: prNum,
      pr_title: prTitle,
      reviewer: c.user.login,
      source: "issue_comment",
      body: c.body,
    });
  }

  // AI reviews with non-empty bodies
  for (const r of data.ai_reviews || []) {
    if (isThinReview(r.body)) continue;
    if (isWalkthroughOrSummary(r.body)) continue;
    allComments.push({
      id: `rv-${r.id}`,
      pr_number: prNum,
      pr_title: prTitle,
      reviewer: r.user.login,
      source: "review",
      body: r.body,
    });
  }
}

// Apply limit
const selected = allComments.slice(0, limit);

// Write prepared comments
const outputPath = path.join(OUTPUT_DIR, "prepared-comments.json");
fs.writeFileSync(outputPath, JSON.stringify(selected, null, 2));

// Summary
const byReviewer: Record<string, number> = {};
for (const c of selected) {
  byReviewer[c.reviewer] = (byReviewer[c.reviewer] || 0) + 1;
}

console.log(`Extracted ${selected.length} comments (limit: ${limit === Infinity ? "none" : limit})`);
console.log("By reviewer:", byReviewer);
console.log(`Saved to: ${outputPath}`);
