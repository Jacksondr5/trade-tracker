// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

interface ImportMetaWithGlob extends ImportMeta {
  glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
}

const modules = (import.meta as ImportMetaWithGlob).glob([
  "./**/*.{ts,js}",
  "!./**/*.test.ts",
  "!./**/*.spec.ts",
]);

describe("strategyDoc", () => {
  const ownerA = "owner-a";
  const ownerB = "owner-b";

  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  function asUser(ownerId: string) {
    return t.withIdentity({ tokenIdentifier: ownerId });
  }

  it("returns null when no doc exists", async () => {
    const result = await asUser(ownerA).query(api.strategyDoc.get, {});
    expect(result).toBeNull();
  });

  it("creates a new strategy doc on first save", async () => {
    await asUser(ownerA).mutation(api.strategyDoc.save, {
      content: "My trading strategy",
    });

    const doc = await asUser(ownerA).query(api.strategyDoc.get, {});
    expect(doc).not.toBeNull();
    expect(doc!.content).toBe("My trading strategy");
    expect(typeof doc!.updatedAt).toBe("number");
  });

  it("upserts an existing doc on subsequent saves", async () => {
    await asUser(ownerA).mutation(api.strategyDoc.save, {
      content: "First draft",
    });
    await asUser(ownerA).mutation(api.strategyDoc.save, {
      content: "Revised strategy",
    });

    const doc = await asUser(ownerA).query(api.strategyDoc.get, {});
    expect(doc!.content).toBe("Revised strategy");

    const allDocs = await t.run(async (ctx) => {
      return await ctx.db.query("strategyDoc").collect();
    });
    const ownerADocs = allDocs.filter((d) => d.ownerId === ownerA);
    expect(ownerADocs).toHaveLength(1);
  });

  it("isolates docs by owner", async () => {
    await asUser(ownerA).mutation(api.strategyDoc.save, {
      content: "Owner A strategy",
    });

    const ownerBDoc = await asUser(ownerB).query(api.strategyDoc.get, {});
    expect(ownerBDoc).toBeNull();

    const ownerADoc = await asUser(ownerA).query(api.strategyDoc.get, {});
    expect(ownerADoc!.content).toBe("Owner A strategy");
  });

  it("throws on invariant violation when multiple docs exist for one owner", async () => {
    await t.run(async (ctx) => {
      await ctx.db.insert("strategyDoc", {
        content: "doc 1",
        ownerId: ownerA,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("strategyDoc", {
        content: "doc 2",
        ownerId: ownerA,
        updatedAt: Date.now(),
      });
    });

    await expect(
      asUser(ownerA).query(api.strategyDoc.get, {}),
    ).rejects.toThrow("Invariant violated");
  });
});
