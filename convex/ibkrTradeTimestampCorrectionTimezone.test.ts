// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);
const originalFormatToParts = Intl.DateTimeFormat.prototype.formatToParts;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("IBKR timestamp correction timezone runtime guard", () => {
  it("fails before correction selection when New York resolves as UTC", async () => {
    vi.resetModules();
    const utcFormatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: "UTC",
      year: "numeric",
    });
    vi.spyOn(Intl.DateTimeFormat.prototype, "formatToParts").mockImplementation(
      (date) => originalFormatToParts.call(utcFormatter, date),
    );
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(
        internal.ibkrTradeTimestampCorrection.correctIbkrTradeTimestamps,
        {
          dryRun: true,
          executions: [
            { executionId: "missing", rawDateTime: "20260810;093518" },
          ],
          maximumCreationTime: Number.MAX_SAFE_INTEGER,
          minimumCreationTime: 0,
        },
      ),
    ).rejects.toThrow(
      "timezone data unavailable in this runtime — America/New_York resolved to UTC",
    );
  });
});
