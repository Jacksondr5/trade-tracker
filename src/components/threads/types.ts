import type { FunctionReturnType } from "convex/server";
import type { api } from "~/convex/_generated/api";

export type ThreadPage = NonNullable<
  FunctionReturnType<typeof api.threads.getThreadPage>
>;
export type ResolvedEpisode = ThreadPage["liveEpisodes"][number];
export type EpisodeSummary = ResolvedEpisode["episode"];
export type ElementView = ResolvedEpisode["itemsSinceCheckpoint"][number];
export type ElementValue = NonNullable<ElementView["value"]>;
export type PlanVersionView = NonNullable<ResolvedEpisode["checkpoint"]>;
export type PlanSections = PlanVersionView["sections"];
export type PlanLine = PlanSections["entry"][number];
export type EpisodePosition = ResolvedEpisode["position"];

export type Desk = FunctionReturnType<typeof api.threads.getDesk>;
export type DeskGroup = Desk["groups"][number];
export type DeskRow = DeskGroup["rows"][number];

/** A plan line as rendered; accepts both the optional-field and nullable shapes. */
export type DisplayLine = {
  asOf?: string | null;
  elementId?: string | null;
  noteId?: string | null;
  text: string;
  value?: ElementValue | null;
};

export const PLAN_SECTION_LABELS: Record<keyof PlanSections, string> = {
  entry: "Entry",
  stop: "Stop",
  targets: "Targets",
  scenarios: "Scenarios",
  structure: "Structure",
  size: "Size",
};

export const PLAN_SECTION_ORDER = [
  "entry",
  "stop",
  "targets",
  "scenarios",
  "structure",
  "size",
] as const satisfies ReadonlyArray<keyof PlanSections>;
