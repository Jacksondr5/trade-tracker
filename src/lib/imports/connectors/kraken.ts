export function shouldContinueKrakenPaging(
  oldestSeenTimestamp: number,
  cursorTimestamp: number | null
): boolean {
  if (cursorTimestamp === null) {
    return true;
  }

  return oldestSeenTimestamp > cursorTimestamp;
}
