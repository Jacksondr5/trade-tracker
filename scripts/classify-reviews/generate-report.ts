/**
 * Generate an analysis report from classified comments.
 *
 * Usage: npx tsx scripts/classify-reviews/generate-report.ts
 */

import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.resolve("output/review-analysis");
const PREPARED = path.join(OUTPUT_DIR, "prepared-comments.json");
const CLASSIFIED = path.join(OUTPUT_DIR, "classified-comments.json");
const REPORT = path.join(OUTPUT_DIR, "analysis-report.json");

interface PreparedComment {
  id: string;
  pr_number: number;
  pr_title: string;
  reviewer: string;
  source: string;
  body: string;
}

interface Classification {
  comment_id: string;
  category: string;
  correctness: number;
  actionability: number;
  severity: number;
  reasoning: string;
}

const ACTIONABLE_CATEGORIES = new Set([
  "bug",
  "performance",
  "design-system",
  "accessibility",
  "convention",
  "test-quality",
  "data-integrity",
  "ux-behavior",
]);

const NOISE_CATEGORIES = new Set([
  "pre-existing",
  "informational",
  "self-resolution",
  "meta",
]);

const comments: PreparedComment[] = JSON.parse(
  fs.readFileSync(PREPARED, "utf-8")
);
const classifications: Classification[] = JSON.parse(
  fs.readFileSync(CLASSIFIED, "utf-8")
);

// Index classifications by comment_id
const classMap = new Map<string, Classification>();
for (const c of classifications) {
  classMap.set(c.comment_id, c);
}

// Merge
const merged = comments
  .map((c) => ({
    ...c,
    classification: classMap.get(c.id),
  }))
  .filter((c) => c.classification);

// Per-reviewer stats
interface ReviewerStats {
  total_comments: number;
  category_distribution: Record<string, number>;
  avg_correctness: number;
  avg_actionability: number;
  avg_severity: number;
  signal_to_noise: number;
  actionable_count: number;
  noise_count: number;
  prs_reviewed: number;
}

function computeStats(
  items: typeof merged
): ReviewerStats {
  const cats: Record<string, number> = {};
  let correctnessSum = 0;
  let actionabilitySum = 0;
  let severitySum = 0;
  let actionable = 0;
  let noise = 0;
  const prs = new Set<number>();

  for (const item of items) {
    const cl = item.classification!;
    cats[cl.category] = (cats[cl.category] || 0) + 1;
    correctnessSum += cl.correctness;
    actionabilitySum += cl.actionability;
    severitySum += cl.severity;
    if (ACTIONABLE_CATEGORIES.has(cl.category)) actionable++;
    if (NOISE_CATEGORIES.has(cl.category)) noise++;
    prs.add(item.pr_number);
  }

  const n = items.length || 1;
  return {
    total_comments: items.length,
    category_distribution: cats,
    avg_correctness: Math.round((correctnessSum / n) * 100) / 100,
    avg_actionability: Math.round((actionabilitySum / n) * 100) / 100,
    avg_severity: Math.round((severitySum / n) * 100) / 100,
    signal_to_noise: actionable / (noise || 1),
    actionable_count: actionable,
    noise_count: noise,
    prs_reviewed: prs.size,
  };
}

// Group by reviewer
const byReviewer: Record<string, typeof merged> = {};
for (const item of merged) {
  const rev = item.reviewer;
  if (!byReviewer[rev]) byReviewer[rev] = [];
  byReviewer[rev].push(item);
}

const reviewerStats: Record<string, ReviewerStats> = {};
for (const [reviewer, items] of Object.entries(byReviewer)) {
  reviewerStats[reviewer] = computeStats(items);
}

// Top findings (highest combined score)
const topFindings = merged
  .filter((c) => ACTIONABLE_CATEGORIES.has(c.classification!.category))
  .map((c) => ({
    comment_id: c.id,
    pr_number: c.pr_number,
    pr_title: c.pr_title,
    reviewer: c.reviewer,
    category: c.classification!.category,
    correctness: c.classification!.correctness,
    actionability: c.classification!.actionability,
    severity: c.classification!.severity,
    combined_score:
      c.classification!.correctness +
      c.classification!.actionability +
      c.classification!.severity,
    reasoning: c.classification!.reasoning,
    body_preview: c.body.slice(0, 200),
  }))
  .sort((a, b) => b.combined_score - a.combined_score)
  .slice(0, 20);

const report = {
  generated_at: new Date().toISOString(),
  total_comments_analyzed: merged.length,
  total_comments_prepared: comments.length,
  classification_coverage: `${merged.length}/${comments.length}`,
  overall_stats: computeStats(merged),
  per_reviewer: reviewerStats,
  top_findings: topFindings,
};

fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`\nReport saved to: ${REPORT}`);
