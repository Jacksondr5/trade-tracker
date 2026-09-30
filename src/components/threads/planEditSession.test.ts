import { describe, expect, it } from "vitest";
import { createPlanEditSession } from "./planEditSession";
import { toPlanSections } from "./PlanEditForm";
import type { PlanSections } from "./types";

function sections(entryText: string): PlanSections {
  return {
    entry: [{ text: entryText, asOf: "2026-09-01" }],
    stop: [],
    targets: [],
    scenarios: [],
    structure: [],
    size: [],
  };
}

function version(versionNumber: number, entryText: string) {
  return { sections: sections(entryText), versionNumber };
}

describe("createPlanEditSession", () => {
  it("uses the draft version as the base token when a draft exists", () => {
    const session = createPlanEditSession(
      {
        checkpoint: version(2, "checkpoint entry"),
        draft: version(3, "draft entry"),
        latestRevision: 40,
      },
      1,
    );
    expect(session.baseVersionNumber).toBe(3);
    expect(session.draftVersionNumber).toBe(3);
    expect(session.observedRevision).toBe(40);
    // Baseline stays the checkpoint, not the draft.
    expect(session.baselineSections?.entry[0]?.text).toBe("checkpoint entry");
  });

  it("falls back to the checkpoint, then null", () => {
    expect(
      createPlanEditSession(
        { checkpoint: version(2, "x"), draft: null, latestRevision: 1 },
        1,
      ).baseVersionNumber,
    ).toBe(2);
    expect(
      createPlanEditSession(
        { checkpoint: null, draft: null, latestRevision: 1 },
        1,
      ),
    ).toMatchObject({ baseVersionNumber: null, baselineSections: null });
  });

  it("keeps the submitted tokens when a later query update arrives mid-edit", () => {
    const live = {
      checkpoint: version(2, "$240 hard exit"),
      draft: null,
      latestRevision: 10,
    };
    const session = createPlanEditSession(live, 1);

    // User touches a field...
    const touched = { ...session.baselineSections!, stop: [] };
    touched.entry = [{ text: "$240 hard exit" }];

    // ...then a live update mutates and replaces the resolved episode.
    live.checkpoint.sections.entry[0]!.text = "changed by counterpart";
    const later = {
      checkpoint: version(3, "later"),
      draft: version(4, "draft"),
      latestRevision: 12,
    };
    expect(later.latestRevision).not.toBe(session.observedRevision);

    expect(session.baseVersionNumber).toBe(2);
    expect(session.observedRevision).toBe(10);
    expect(session.baselineSections?.entry[0]?.text).toBe("$240 hard exit");

    // Lines whose text is unchanged keep their citations from the snapshot.
    const submitted = toPlanSections(
      {
        entry: "$240 hard exit",
        stop: "",
        targets: "",
        scenarios: "",
        structure: "",
        size: "",
      },
      session.baselineSections,
    );
    expect(submitted.entry).toEqual([{ text: "$240 hard exit", asOf: "2026-09-01" }]);
  });
});
