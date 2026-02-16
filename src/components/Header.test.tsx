import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("Header navigation", () => {
  it("includes Import Inbox navigation link", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/Header.tsx"),
      "utf8",
    );

    expect(source).toContain('{ href: "/imports", label: "Import Inbox" }');
  });
});
