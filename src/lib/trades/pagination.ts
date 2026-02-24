export const TRADES_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_TRADES_PAGE_SIZE = 25;

export function normalizeTradesPage(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

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
