import { describe, expect, it } from "vitest";
import {
  elementRequiresAsOf,
  inferEpisodeLifecycle,
  isAllowedStatusTransition,
  isIsoDate,
  isLevelBearingElement,
  partitionElementsAroundCheckpoint,
  resolveCampaignRules,
} from "./planModel";

describe("inferEpisodeLifecycle", () => {
  it("is idea until an agreed entry or endorsed plan exists", () => {
    expect(
      inferEpisodeLifecycle({
        hasAgreedEntryElement: false,
        hasEndorsedPlan: false,
        hasLinkedTrades: false,
        netQuantity: 0,
      }),
    ).toBe("idea");
    expect(
      inferEpisodeLifecycle({
        hasAgreedEntryElement: true,
        hasEndorsedPlan: false,
        hasLinkedTrades: false,
        netQuantity: 0,
      }),
    ).toBe("watching");
    expect(
      inferEpisodeLifecycle({
        hasAgreedEntryElement: false,
        hasEndorsedPlan: true,
        hasLinkedTrades: false,
        netQuantity: 0,
      }),
    ).toBe("watching");
  });

  it("lets fills win over planning state", () => {
    expect(
      inferEpisodeLifecycle({
        hasAgreedEntryElement: false,
        hasEndorsedPlan: false,
        hasLinkedTrades: true,
        netQuantity: 5,
      }),
    ).toBe("active");
    expect(
      inferEpisodeLifecycle({
        hasAgreedEntryElement: true,
        hasEndorsedPlan: true,
        hasLinkedTrades: true,
        netQuantity: 0,
      }),
    ).toBe("closed");
  });
});

describe("elementRequiresAsOf", () => {
  it("requires an as-of date only when a value is attached", () => {
    expect(
      elementRequiresAsOf({ statement: "Broke a 4h uptrend", value: undefined }),
    ).toBe(false);
    expect(
      elementRequiresAsOf({
        statement: "Add only if SMH confirms",
        value: undefined,
      }),
    ).toBe(false);
    expect(
      elementRequiresAsOf({
        statement: "Broker stop",
        value: {
          amount: 875,
          provenance: "user_reported",
          scope: "per_share",
          unit: "usd",
        },
      }),
    ).toBe(true);
  });
});

describe("isIsoDate", () => {
  it("accepts calendar dates only", () => {
    expect(isIsoDate("2026-09-21")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("21-09-2026")).toBe(false);
  });
});

describe("partitionElementsAroundCheckpoint", () => {
  const elements = [
    { _id: "a", revision: 1, status: "agreed" as const, statusRevision: 1 },
    { _id: "b", revision: 2, status: "proposed" as const, statusRevision: 2 },
    { _id: "c", revision: 5, status: "agreed" as const, statusRevision: 5 },
    { _id: "d", revision: 3, status: "dropped" as const, statusRevision: 3 },
  ];

  it("orders by revision and keeps every open proposal visible", () => {
    const withLateProposal = [
      ...elements,
      { _id: "e", revision: 6, status: "proposed" as const, statusRevision: 6 },
    ];
    const result = partitionElementsAroundCheckpoint(withLateProposal, 3);
    expect(result.history.map((e) => e._id)).toEqual(["a", "b", "d"]);
    expect(result.itemsSinceCheckpoint.map((e) => e._id)).toEqual(["c", "e"]);
    expect(
      result.openProposals.map((e) => [e._id, e.beforeCheckpoint]),
    ).toEqual([
      ["b", true],
      ["e", false],
    ]);
  });

  it("shows a status change after the checkpoint as a delta item", () => {
    // "b" was proposed before the checkpoint and agreed after it.
    const agreedLater = elements.map((element) =>
      element._id === "b"
        ? { ...element, status: "agreed" as const, statusRevision: 7 }
        : element,
    );
    const result = partitionElementsAroundCheckpoint(agreedLater, 3);
    expect(result.history.map((e) => e._id)).toEqual(["a", "b", "d"]);
    expect(result.itemsSinceCheckpoint.map((e) => e._id)).toEqual(["c", "b"]);
    expect(result.openProposals).toEqual([]);
  });

  it("treats everything as the delta when there is no checkpoint", () => {
    const result = partitionElementsAroundCheckpoint(elements, null);
    expect(result.history).toEqual([]);
    expect(result.itemsSinceCheckpoint.map((e) => e._id)).toEqual([
      "a",
      "b",
      "d",
      "c",
    ]);
  });
});

describe("resolveCampaignRules", () => {
  it("drops closed elements and separates exemptions", () => {
    const result = resolveCampaignRules(
      [
        { _id: "gate", revision: 1, status: "agreed", statusRevision: 1 },
        { _id: "old", revision: 2, status: "superseded", statusRevision: 4 },
        { _id: "cap", revision: 3, status: "proposed", statusRevision: 3 },
      ],
      new Set(["gate"]),
    );
    expect(result.applicable.map((e) => e._id)).toEqual(["cap"]);
    expect(result.exempted.map((e) => e._id)).toEqual(["gate"]);
  });
});

describe("status transitions", () => {
  it("never flips agreed back to proposed", () => {
    expect(isAllowedStatusTransition("proposed", "agreed")).toBe(true);
    expect(isAllowedStatusTransition("proposed", "dropped")).toBe(true);
    expect(isAllowedStatusTransition("agreed", "dropped")).toBe(true);
    expect(isAllowedStatusTransition("agreed", "proposed")).toBe(false);
    expect(isAllowedStatusTransition("superseded", "agreed")).toBe(false);
    expect(isAllowedStatusTransition("dropped", "agreed")).toBe(false);
  });
});

describe("isLevelBearingElement", () => {
  it("recognizes the reserved entry kind, stops, and per-share dollar levels", () => {
    expect(isLevelBearingElement({ kind: "Entry" })).toBe(true);
    expect(isLevelBearingElement({ kind: "rule" })).toBe(false);
    expect(
      isLevelBearingElement({
        value: {
          amount: 875,
          provenance: "user_reported",
          scope: "per_share",
          stopKind: "broker_order",
          unit: "usd",
        },
      }),
    ).toBe(true);
    expect(
      isLevelBearingElement({
        value: { amount: 875, provenance: "user_reported", scope: "per_share", unit: "usd" },
      }),
    ).toBe(true);
    expect(
      isLevelBearingElement({
        value: { amount: 3, provenance: "hypothetical", scope: "portfolio", unit: "percent" },
      }),
    ).toBe(false);
  });
});
