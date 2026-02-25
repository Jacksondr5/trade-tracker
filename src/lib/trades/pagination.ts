export const TRADES_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_TRADES_PAGE_SIZE = 25;
const ROOT_CURSOR_TOKEN = "$root$";

export function normalizeTradesPageSize(value: number): number {
  if (
    TRADES_PAGE_SIZE_OPTIONS.includes(
      value as (typeof TRADES_PAGE_SIZE_OPTIONS)[number],
    )
  ) {
    return value;
  }

  return DEFAULT_TRADES_PAGE_SIZE;
}

export function normalizeTradesCursor(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function encodeCursorHistory(
  cursors: ReadonlyArray<string | null>,
): string | null {
  if (cursors.length === 0) return null;
  return cursors
    .map((cursor) =>
      cursor === null ? ROOT_CURSOR_TOKEN : encodeURIComponent(cursor),
    )
    .join(",");
}

export function decodeCursorHistory(value: string | null): Array<string | null> {
  if (!value) return [];
  return value
    .split(",")
    .filter((cursor) => cursor.length > 0)
    .map((cursor) =>
      cursor === ROOT_CURSOR_TOKEN ? null : decodeURIComponent(cursor),
    );
}
