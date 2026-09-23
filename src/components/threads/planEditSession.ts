import type { PlanSections, ResolvedEpisode } from "./types";

/**
 * Snapshot taken when a plan edit session opens. The concurrency tokens and
 * the baseline sections are frozen here so a live query update while the
 * user is typing cannot change what gets submitted.
 */
export type PlanEditSession = {
  /** Latest version number including drafts; null when none exists. */
  baseVersionNumber: number | null;
  /** Checkpoint sections (or empty) the editor was prefilled from. */
  baselineSections: PlanSections | null;
  /** Unendorsed draft version at open time, if any. */
  draftVersionNumber: number | null;
  observedRevision: number;
  /** Increments per open/reload so the form remounts with fresh values. */
  sessionId: number;
};

type SessionSource = Pick<
  ResolvedEpisode,
  "checkpoint" | "draft" | "latestRevision"
>;

function cloneSections(sections: PlanSections): PlanSections {
  return {
    entry: sections.entry.map((line) => ({ ...line })),
    stop: sections.stop.map((line) => ({ ...line })),
    targets: sections.targets.map((line) => ({ ...line })),
    scenarios: sections.scenarios.map((line) => ({ ...line })),
    structure: sections.structure.map((line) => ({ ...line })),
    size: sections.size.map((line) => ({ ...line })),
  };
}

export function createPlanEditSession(
  resolved: SessionSource,
  sessionId: number,
): PlanEditSession {
  return {
    baseVersionNumber:
      resolved.draft?.versionNumber ??
      resolved.checkpoint?.versionNumber ??
      null,
    baselineSections: resolved.checkpoint
      ? cloneSections(resolved.checkpoint.sections)
      : null,
    draftVersionNumber: resolved.draft?.versionNumber ?? null,
    observedRevision: resolved.latestRevision,
    sessionId,
  };
}
