import { describe, expect, it } from "vitest";
import { IMPORT_SYNC_INTERVAL_MINUTES } from "~/lib/imports/schedule";

describe("import schedule", () => {
  it("registers a 15-minute sync for active brokerage connections", () => {
    expect(IMPORT_SYNC_INTERVAL_MINUTES).toBe(15);
  });
});
