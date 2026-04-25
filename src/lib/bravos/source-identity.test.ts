import { describe, expect, it } from "vitest";
import {
  buildBravosSourceIdentity,
  normalizeBravosSourceUrl,
} from "./source-identity";

describe("normalizeBravosSourceUrl", () => {
  it("normalizes tracking params and hashes", () => {
    expect(
      normalizeBravosSourceUrl(
        "https://example.com/post/123?utm_source=x#comments",
      ),
    ).toBe("https://example.com/post/123");
  });

  it("keeps non-tracking params in stable order", () => {
    expect(
      normalizeBravosSourceUrl("https://example.com/post/123?b=2&a=1"),
    ).toBe("https://example.com/post/123?a=1&b=2");
  });
});

describe("buildBravosSourceIdentity", () => {
  it("uses normalized source url even when post id data exists elsewhere", () => {
    expect(
      buildBravosSourceIdentity({
        sourceUrl: "https://example.com/post/123?utm_campaign=x#top",
      }),
    ).toBe("https://example.com/post/123");
  });
});
