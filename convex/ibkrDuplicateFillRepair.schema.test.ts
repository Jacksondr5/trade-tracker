import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INBOUND_REFERENCE_FIELD_DENOMINATOR } from "./ibkrDuplicateFillRepair";

describe("IBKR duplicate repair reference denominator", () => {
  it("matches every schema marker and every typed trade reference field", () => {
    const schemaSource = readFileSync(
      new URL("./schema.ts", import.meta.url),
      "utf8",
    );
    const markers = [
      ...schemaSource.matchAll(
        /IBKR_DUPLICATE_REFERENCE_FIELD: ([A-Za-z]+\.[A-Za-z]+)/g,
      ),
    ].map((match) => match[1]!);
    expect(markers.sort()).toEqual(
      [...INBOUND_REFERENCE_FIELD_DENOMINATOR].sort(),
    );

    const typedReferenceFields = [
      ...schemaSource.matchAll(
        /^\s*([A-Za-z]+):\s+.*v\.id\("(?:trades|inboxTrades)"\)/gm,
      ),
    ].map((match) => match[1]!);
    for (const field of typedReferenceFields) {
      expect(
        INBOUND_REFERENCE_FIELD_DENOMINATOR.some((entry) =>
          entry.endsWith(`.${field}`),
        ),
      ).toBe(true);
    }
    expect(typedReferenceFields.sort()).toEqual([
      "inboxTradeId",
      "sourceTradeId",
      "sourceTradeIds",
    ]);
  });
});
