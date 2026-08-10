export function parseExpectedAccountIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((accountId) => accountId.trim())
        .filter(Boolean),
    ),
  );
}

export function hasCurrentSyncFailure(args: {
  lastFailedSyncAt: number | undefined;
  lastSuccessfulSyncAt: number | undefined;
}): boolean {
  return (
    args.lastFailedSyncAt !== undefined &&
    args.lastFailedSyncAt > (args.lastSuccessfulSyncAt ?? 0)
  );
}

export function hasInFlightRetryAfterCurrentFailure(args: {
  currentSyncFailure: boolean;
  latestSyncRunStatus: string | undefined;
}): boolean {
  return (
    args.currentSyncFailure &&
    ["queued", "requesting", "waiting_for_statement", "processing"].includes(
      args.latestSyncRunStatus ?? "",
    )
  );
}

export function toOptionalStringArrayPatch(args: {
  cleared: boolean;
  fieldName: string;
  persistedValue: string[] | undefined;
  value: string;
}) {
  if (args.cleared) return { kind: "clear" as const };
  const value = parseExpectedAccountIds(args.value);
  if (value.length === 0) {
    if (args.persistedValue === undefined) return undefined;
    throw new Error(
      `${args.fieldName} cannot be empty; use Clear to remove it`,
    );
  }
  return JSON.stringify(value) === JSON.stringify(args.persistedValue)
    ? undefined
    : { kind: "set" as const, value };
}
