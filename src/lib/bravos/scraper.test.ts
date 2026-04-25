import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractBravosListingPage,
  extractBravosListingPosts,
  extractBravosPostPayload,
} from "./scraper";

describe("extractBravosListingPosts", () => {
  it("returns post links and timestamps from listing markup", () => {
    const result = extractBravosListingPosts(
      `<html><body>
        <a href="/post/1?utm_source=x" data-post-id="post_1" data-published-at="2026-04-10T13:00:00Z">QQQ post</a>
      </body></html>`,
      { baseUrl: "https://example.com" },
    );

    expect(result).toEqual([
      expect.objectContaining({
        sourceIdentity: "https://example.com/post/1",
        sourceUrl: "https://example.com/post/1",
      }),
    ]);
  });

  it("returns Bravos archive post links and next-page url", () => {
    const fixture = readFileSync(
      resolve(process.cwd(), "trade-alerts.html"),
      "utf8",
    );

    const result = extractBravosListingPage(fixture, {
      baseUrl: "https://bravosresearch.com/category/portfolio-update/",
    });

    expect(result.posts).toHaveLength(10);
    expect(result.posts[0]).toMatchObject({
      sourceIdentity:
        "https://bravosresearch.com/news-feed/closing-global-agriculture-producers-etf-vegi-breakdown",
      sourceUrl:
        "https://bravosresearch.com/news-feed/closing-global-agriculture-producers-etf-vegi-breakdown",
    });
    expect(result.nextPageUrl).toBe(
      "https://bravosresearch.com/category/portfolio-update/page/2/",
    );
  });
});

describe("extractBravosPostPayload", () => {
  it("returns normalized text and image urls for a post page", () => {
    const result = extractBravosPostPayload(
      `<html><body>
        <article data-post-id="post_1">
          <h1>QQQ Breakout</h1>
          <p>Watch QQQ above the prior high.</p>
          <img src="/charts/qqq.png" />
        </article>
      </body></html>`,
      { baseUrl: "https://example.com", sourceUrl: "https://example.com/post/1" },
    );

    expect(result.rawText).toContain("Watch QQQ above the prior high.");
    expect(result.imageUrls).toEqual(["https://example.com/charts/qqq.png"]);
    expect(result.title).toBe("QQQ Breakout");
  });

  it("extracts a plain-text title from nested post heading markup", () => {
    const result = extractBravosPostPayload(
      `<html><body>
        <article>
          <main>
            <article>
              <h1><span>QQQ</span> Breakout &amp; Follow-Up</h1>
              <p>Watch QQQ above the prior high.</p>
            </article>
          </main>
        </article>
      </body></html>`,
    );

    expect(result.title).toBe("QQQ Breakout & Follow-Up");
  });

  it("scopes text and images to the Bravos post hierarchy", () => {
    const result = extractBravosPostPayload(
      `<html>
        <head><link rel="canonical" href="https://example.com/post/1" /></head>
        <body>
          <nav>Navigation text that should not be captured</nav>
          <img src="/layout/logo.png" />
          <article>
            <p>Outer article text should not be captured.</p>
            <main>
              <article data-post-id="post_1">
                <h1>QQQ Breakout</h1>
                <time datetime="2026-04-10T14:30:00Z">April 10</time>
                <p>Scoped post thesis only.</p>
                <img src="/charts/qqq.png" />
              </article>
            </main>
          </article>
          <aside>Recommended reading should not be captured</aside>
        </body>
      </html>`,
      { baseUrl: "https://example.com" },
    );

    expect(result.rawText).toContain("Scoped post thesis only.");
    expect(result.rawText).not.toContain("Navigation text");
    expect(result.rawText).not.toContain("Outer article text");
    expect(result.rawText).not.toContain("Recommended reading");
    expect(result.imageUrls).toEqual(["https://example.com/charts/qqq.png"]);
    expect(result.sourcePostDate).toBe("2026-04-10");
    expect(result.sourceUrl).toBe("https://example.com/post/1");
  });

  it("extracts the post source date when it is present", () => {
    const result = extractBravosPostPayload(
      `<html><body><article>
        <time datetime="2026-04-10T14:30:00Z">April 10</time>
        <p>Follow-up text</p>
      </article></body></html>`,
    );

    expect(result.sourcePostDate).toBe("2026-04-10");
  });

  it("extracts MM/DD/YYYY post dates from post text", () => {
    const result = extractBravosPostPayload(
      `<html><body>
        <article>
          <main>
            <article>
              <p>Published 04/10/2026</p>
              <p>Follow-up text</p>
            </article>
          </main>
        </article>
      </body></html>`,
    );

    expect(result.sourcePostDate).toBe("2026-04-10");
  });

  it("fails instead of falling back to full-page text when no post body exists", () => {
    expect(() =>
      extractBravosPostPayload(
        `<html><body>
          <nav>Navigation text</nav>
          <main>Page chrome only</main>
        </body></html>`,
      ),
    ).toThrow("Could not find Bravos post body");
  });
});
