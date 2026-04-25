export interface BravosSourceIdentityInput {
  sourceUrl: string;
}

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

export function normalizeBravosSourceUrl(url: string): string {
  const parsed = new URL(url.trim());
  parsed.hash = "";

  for (const key of [...parsed.searchParams.keys()]) {
    if (
      TRACKING_PARAM_NAMES.has(key.toLowerCase()) ||
      TRACKING_PARAM_PREFIXES.some((prefix) =>
        key.toLowerCase().startsWith(prefix),
      )
    ) {
      parsed.searchParams.delete(key);
    }
  }

  parsed.searchParams.sort();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

  return parsed.toString();
}

export function buildBravosSourceIdentity(
  input: BravosSourceIdentityInput,
): string {
  return normalizeBravosSourceUrl(input.sourceUrl);
}
