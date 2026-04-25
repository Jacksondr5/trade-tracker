import {
  buildBravosSourceIdentity,
  normalizeBravosSourceUrl,
} from "./source-identity";

export interface BravosListingPostReference {
  sourceIdentity: string;
  sourcePublishedAt?: number;
  sourceUrl: string;
}

export interface BravosListingPage {
  nextPageUrl?: string;
  posts: BravosListingPostReference[];
}

export interface BravosPostPayload {
  imageUrls: string[];
  rawText: string;
  sourcePostDate?: string;
  sourcePublishedAt?: number;
  sourceUrl?: string;
  title?: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|article|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractBalancedElementHtml(
  html: string,
  startIndex: number,
  tagName: string,
): string | null {
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = startIndex;

  let depth = 0;
  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0];
    if (tag.startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(startIndex, match.index + tag.length);
      }
    } else if (!tag.endsWith("/>")) {
      depth += 1;
    }
  }

  return null;
}

function extractFirstElementHtml(html: string, tagName: string): string | null {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, "i");
  const match = html.match(tagPattern);
  if (match?.index === undefined) {
    return null;
  }

  return extractBalancedElementHtml(html, match.index, tagName) ?? match[0];
}

function extractFirstArticleHtml(html: string): string | null {
  return extractFirstElementHtml(html, "article");
}

function extractNestedElementHtml(html: string, path: string[]): string | null {
  let currentHtml = html;
  for (const tagName of path) {
    const nextHtml = extractFirstElementHtml(currentHtml, tagName);
    if (nextHtml === null) {
      return null;
    }
    currentHtml = nextHtml;
  }

  return currentHtml;
}

function extractPostScopeHtml(html: string): string {
  const postHtml =
    extractNestedElementHtml(html, ["body", "article", "main", "article"]) ??
    extractFirstArticleHtml(html);

  if (postHtml === null) {
    throw new Error("Could not find Bravos post body at body article main article");
  }

  return postHtml;
}

function absoluteUrl(value: string, baseUrl?: string): string | null {
  try {
    return new URL(decodeHtml(value), baseUrl).toString();
  } catch {
    return null;
  }
}

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return decodeHtml(value);
    }
  }
  return undefined;
}

function isoDateFromValue(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const directIsoDate = value.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (directIsoDate) {
    return directIsoDate;
  }
  const slashDate = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashDate) {
    const month = slashDate[1].padStart(2, "0");
    const day = slashDate[2].padStart(2, "0");
    return `${slashDate[3]}-${month}-${day}`;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 10)
    : undefined;
}

function timestampFromValue(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTitle(value: string | undefined): string | undefined {
  const title = value ? stripTags(value).trim() : undefined;
  return title ? title : undefined;
}

function extractAttributeValue(attrs: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstMatch(attrs, [
    new RegExp(`\\b${escapedName}=["']([^"']+)["']`, "i"),
  ]);
}

function buildListingPostReference(args: {
  attrs?: string;
  baseUrl?: string;
  href: string;
}): BravosListingPostReference | null {
  const sourceUrl = absoluteUrl(args.href, args.baseUrl);
  if (!sourceUrl) {
    return null;
  }

  const normalizedUrl = normalizeBravosSourceUrl(sourceUrl);
  const attrs = args.attrs ?? "";
  const timestampValue =
    extractAttributeValue(attrs, "data-published-at") ??
    extractAttributeValue(attrs, "datetime");
  const sourceIdentity = buildBravosSourceIdentity({
    sourceUrl: normalizedUrl,
  });

  return {
    sourceIdentity,
    sourcePublishedAt: timestampFromValue(timestampValue),
    sourceUrl: normalizedUrl,
  };
}

function findPrimaryListingPostHref(blockHtml: string): string | undefined {
  const hrefs = [...blockHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter((href) => {
      if (href.includes("#")) {
        return false;
      }
      if (/\/category\//i.test(href)) {
        return false;
      }
      return /\/(?:news-feed|portfolio-update)\//i.test(href);
    });

  return hrefs[0];
}

export function extractBravosListingPosts(
  html: string,
  options: { baseUrl?: string } = {},
): BravosListingPostReference[] {
  const seen = new Set<string>();
  const posts: BravosListingPostReference[] = [];

  const postBlockPattern =
    /<div\b([^>]*\bclass=["'][^"']*\bpost_single\b[^"']*["'][^>]*)>([\s\S]*?)(?=<div\b[^>]*\bclass=["'][^"']*\bpost_single\b|<div\b[^>]*\bclass=["'][^"']*\bpagination\b|<\/main>|$)/gi;
  for (const match of html.matchAll(postBlockPattern)) {
    const attrs = match[1];
    const blockHtml = match[2];
    const href = findPrimaryListingPostHref(blockHtml);
    if (!href) {
      continue;
    }
    const post = buildListingPostReference({
      attrs,
      baseUrl: options.baseUrl,
      href,
    });
    if (!post || seen.has(post.sourceIdentity)) {
      continue;
    }
    seen.add(post.sourceIdentity);
    posts.push(post);
  }

  if (posts.length > 0) {
    return posts;
  }

  const anchorPattern = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const attrs = `${match[1] ?? ""} ${match[3] ?? ""}`;
    const href = match[2];
    const post = buildListingPostReference({
      attrs,
      baseUrl: options.baseUrl,
      href,
    });
    if (!post || seen.has(post.sourceIdentity)) {
      continue;
    }
    seen.add(post.sourceIdentity);
    posts.push(post);
  }
  return posts;
}

export function extractBravosListingPage(
  html: string,
  options: { baseUrl?: string } = {},
): BravosListingPage {
  const nextPageHref = firstMatch(html, [
    /<a\b[^>]*\bclass=["'][^"']*\bnext\b[^"']*\bpage-numbers\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i,
    /<link\s+rel=["']next["']\s+href=["']([^"']+)["']/i,
  ]);
  return {
    nextPageUrl: nextPageHref
      ? (absoluteUrl(nextPageHref, options.baseUrl) ?? undefined)
      : undefined,
    posts: extractBravosListingPosts(html, options),
  };
}

export function extractBravosPostPayload(
  html: string,
  options: { baseUrl?: string; sourceUrl?: string } = {},
): BravosPostPayload {
  const postHtml = extractPostScopeHtml(html);
  const title = normalizeTitle(
    firstMatch(postHtml, [
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    ]) ?? firstMatch(html, [
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]),
  );
  const dateValue = firstMatch(postHtml, [
    /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i,
    /\bdata-published-at=["']([^"']+)["']/i,
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
  ]) ?? firstMatch(html, [
    /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i,
    /\bdata-published-at=["']([^"']+)["']/i,
    /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
    /<meta\s+(?:name|property)=["'](?:article:published_time|date)["']\s+content=["']([^"']+)["']/i,
  ]);
  const imageUrls = [
    ...postHtml.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi),
  ]
    .map((match) => absoluteUrl(match[1], options.baseUrl))
    .filter((url): url is string => url !== null);
  const sourceUrl =
    options.sourceUrl ??
    firstMatch(html, [
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i,
      /<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i,
    ]);

  return {
    imageUrls: [...new Set(imageUrls)],
    rawText: stripTags(postHtml),
    sourcePostDate: isoDateFromValue(dateValue),
    sourcePublishedAt: timestampFromValue(dateValue),
    sourceUrl: sourceUrl ? normalizeBravosSourceUrl(sourceUrl) : undefined,
    title,
  };
}
