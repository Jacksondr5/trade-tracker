import { v, type Infer } from "convex/values";

/**
 * Shared validators and pure helpers for the Phase 3 instrument thread model:
 * threads, episodes, elements, and plan versions.
 *
 * Every write records three separate facts: who authored the statement
 * (`author`), who performed the write (`actor`), and which channel produced
 * it (`source`). Endorsement is a fourth, recorded on plan versions only.
 */

export const actorValidator = v.union(
  v.literal("user"),
  v.literal("counterpart"),
  v.literal("agent"),
  v.literal("system"),
);
export type Actor = Infer<typeof actorValidator>;

export const elementAuthorValidator = v.union(
  v.literal("user"),
  v.literal("counterpart"),
);
export type ElementAuthor = Infer<typeof elementAuthorValidator>;

export const writeSourceValidator = v.union(
  v.literal("conversation"),
  v.literal("app"),
  v.literal("migration"),
  v.literal("trade_history"),
);
export type WriteSource = Infer<typeof writeSourceValidator>;

export const elementStatusValidator = v.union(
  v.literal("proposed"),
  v.literal("agreed"),
  v.literal("superseded"),
  v.literal("dropped"),
);
export type ElementStatus = Infer<typeof elementStatusValidator>;

export const episodeLifecycleValidator = v.union(
  v.literal("idea"),
  v.literal("watching"),
  v.literal("active"),
  v.literal("closed"),
);
export type EpisodeLifecycle = Infer<typeof episodeLifecycleValidator>;

export const episodeSourceValidator = v.union(
  v.literal("user"),
  v.literal("external"),
);

export const elementValueValidator = v.object({
  amount: v.number(),
  provenance: v.union(
    v.literal("hypothetical"),
    v.literal("user_reported"),
    v.literal("broker_verified"),
  ),
  scope: v.union(
    v.literal("per_share"),
    v.literal("position"),
    v.literal("portfolio"),
  ),
  stopKind: v.optional(
    v.union(v.literal("planned_exit"), v.literal("broker_order")),
  ),
  unit: v.union(
    v.literal("usd"),
    v.literal("shares"),
    v.literal("percent"),
    v.literal("ratio"),
  ),
});
export type ElementValue = Infer<typeof elementValueValidator>;

export const planLineValidator = v.object({
  asOf: v.optional(v.string()),
  elementId: v.optional(v.id("planElements")),
  noteId: v.optional(v.id("notes")),
  text: v.string(),
  value: v.optional(elementValueValidator),
});
export type PlanLine = Infer<typeof planLineValidator>;

export const PLAN_SECTION_KEYS = [
  "entry",
  "stop",
  "targets",
  "scenarios",
  "structure",
  "size",
] as const;
export type PlanSectionKey = (typeof PLAN_SECTION_KEYS)[number];

export const planSectionsValidator = v.object({
  entry: v.array(planLineValidator),
  scenarios: v.array(planLineValidator),
  size: v.array(planLineValidator),
  stop: v.array(planLineValidator),
  structure: v.array(planLineValidator),
  targets: v.array(planLineValidator),
});
export type PlanSections = Infer<typeof planSectionsValidator>;

export const MAX_PLAN_LINES_PER_SECTION = 25;
export const MAX_ELEMENT_STATEMENT_LENGTH = 2_000;
export const MAX_PLAN_LINE_LENGTH = 1_000;

/** Element kinds the lifecycle rule recognizes. Kinds are otherwise free text. */
export const ENTRY_ELEMENT_KIND = "entry";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

export function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function emptyPlanSections(): PlanSections {
  return {
    entry: [],
    scenarios: [],
    size: [],
    stop: [],
    structure: [],
    targets: [],
  };
}

/** True when an element still counts toward the current plan. */
export function isOpenElementStatus(status: ElementStatus): boolean {
  return status === "proposed" || status === "agreed";
}

/**
 * A typed value must say when it was true. Plain statements may carry
 * numbers that do not drift ("4h uptrend", "Scenario 4"), so the as-of date
 * stays optional there and the counterpart sets it when a level is meant.
 */
export function elementRequiresAsOf(args: {
  statement: string;
  value: ElementValue | undefined;
}): boolean {
  return args.value !== undefined;
}

/**
 * True when an agreed element carries a level: the reserved `entry` kind, a
 * stop of either kind, or a per-share dollar amount.
 */
export function isLevelBearingElement(element: {
  kind?: string;
  value?: ElementValue;
}): boolean {
  if (element.kind?.trim().toLowerCase() === ENTRY_ELEMENT_KIND) return true;
  const value = element.value;
  if (!value) return false;
  return (
    value.stopKind !== undefined ||
    (value.unit === "usd" && value.scope === "per_share")
  );
}

const ALLOWED_STATUS_TRANSITIONS: Record<ElementStatus, ElementStatus[]> = {
  agreed: ["dropped"],
  dropped: [],
  proposed: ["agreed", "dropped"],
  superseded: [],
};

/** Un-agreeing is a supersession or a drop with evidence, never a flip back. */
export function isAllowedStatusTransition(
  from: ElementStatus,
  to: ElementStatus,
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export type LifecycleInputs = {
  /** An agreed element with the reserved `entry` kind or a level-bearing value. */
  hasAgreedEntryElement: boolean;
  hasEndorsedPlan: boolean;
  /** True once any linked trade exists. */
  hasLinkedTrades: boolean;
  /** Net open quantity from linked trades; 0 when flat or never filled. */
  netQuantity: number;
};

/**
 * Lifecycle is inferred, never set. Fills win over planning: an episode can
 * be active with no plan, and a closed episode never reopens.
 */
export function inferEpisodeLifecycle(
  inputs: LifecycleInputs,
): EpisodeLifecycle {
  if (inputs.hasLinkedTrades) {
    return inputs.netQuantity !== 0 ? "active" : "closed";
  }
  if (inputs.hasEndorsedPlan || inputs.hasAgreedEntryElement) {
    return "watching";
  }
  return "idea";
}

export function isLiveLifecycle(lifecycle: EpisodeLifecycle): boolean {
  return lifecycle !== "closed";
}

export type ResolvableElement = {
  _id: string;
  revision: number;
  status: ElementStatus;
  statusRevision: number;
};

/** The revision at which the element last changed: creation or status move. */
export function effectiveRevision(element: {
  revision: number;
  statusRevision: number;
}): number {
  return Math.max(element.revision, element.statusRevision);
}

/**
 * Splits an episode's elements around its checkpoint. An element belongs to
 * the delta when it was created or changed status after the compiled-through
 * revision, so agreeing or dropping an older proposal is visible as a change
 * rather than vanishing into history. History keeps everything created at or
 * before the checkpoint. Open proposals stay visible regardless of age
 * because nonmention is never evidence of withdrawal.
 */
export function partitionElementsAroundCheckpoint<T extends ResolvableElement>(
  elements: T[],
  compiledThroughRevision: number | null,
): {
  history: T[];
  itemsSinceCheckpoint: T[];
  /** Everything still on the table, before and after the checkpoint. */
  openProposals: Array<T & { beforeCheckpoint: boolean }>;
} {
  const byEffective = [...elements].sort(
    (a, b) => effectiveRevision(a) - effectiveRevision(b),
  );
  const createdBefore = (element: T) =>
    compiledThroughRevision !== null &&
    element.revision <= compiledThroughRevision;
  const changedAfter = (element: T) =>
    compiledThroughRevision === null ||
    effectiveRevision(element) > compiledThroughRevision;
  return {
    history: [...elements]
      .filter(createdBefore)
      .sort((a, b) => a.revision - b.revision),
    itemsSinceCheckpoint: byEffective.filter(changedAfter),
    openProposals: byEffective
      .filter((element) => element.status === "proposed")
      .map((element) => ({
        ...element,
        beforeCheckpoint: createdBefore(element),
      })),
  };
}

/**
 * The derived rule set for an episode: campaign elements that are still open
 * minus the ones the episode has exempted itself from.
 */
export function resolveCampaignRules<T extends ResolvableElement>(
  campaignElements: T[],
  exemptions: ReadonlySet<string>,
): { applicable: T[]; exempted: T[] } {
  const open = campaignElements
    .filter((element) => isOpenElementStatus(element.status))
    .sort((a, b) => a.revision - b.revision);
  return {
    applicable: open.filter((element) => !exemptions.has(element._id)),
    exempted: open.filter((element) => exemptions.has(element._id)),
  };
}
