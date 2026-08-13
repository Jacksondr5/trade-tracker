const IBKR_TIME_ZONE = "America/New_York";

type DateTimeParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

const easternFormatter = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: IBKR_TIME_ZONE,
  year: "numeric",
});

function easternParts(timestamp: number): DateTimeParts | undefined {
  const values = new Map(
    easternFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const parts = {
    day: values.get("day"),
    hour: values.get("hour"),
    minute: values.get("minute"),
    month: values.get("month"),
    second: values.get("second"),
    year: values.get("year"),
  };
  if (Object.values(parts).some((part) => part === undefined)) return undefined;
  return parts as DateTimeParts;
}

function utcFromParts(parts: DateTimeParts): number | undefined {
  const values = [
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ];
  if (values.some((part) => !Number.isInteger(part))) return undefined;
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > 31 ||
    parts.hour < 0 ||
    parts.hour > 23 ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    parts.second < 0 ||
    parts.second > 59
  ) {
    return undefined;
  }

  const timestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const check = new Date(timestamp);
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() + 1 !== parts.month ||
    check.getUTCDate() !== parts.day ||
    check.getUTCHours() !== parts.hour ||
    check.getUTCMinutes() !== parts.minute ||
    check.getUTCSeconds() !== parts.second
  ) {
    return undefined;
  }
  return timestamp;
}

function easternWallClockToTimestamp(parts: DateTimeParts): number | undefined {
  const desiredWallClock = utcFromParts(parts);
  if (desiredWallClock === undefined) return undefined;

  let candidate = desiredWallClock;
  const attemptedCandidates = new Map<number, number>();
  for (let attempt = 0; attempt < 4; attempt++) {
    const actualParts = easternParts(candidate);
    if (!actualParts) return undefined;
    const actualWallClock = utcFromParts(actualParts);
    if (actualWallClock === undefined) return undefined;
    const adjustment = desiredWallClock - actualWallClock;
    if (adjustment === 0) return candidate;
    attemptedCandidates.set(candidate, actualWallClock);
    const nextCandidate = candidate + adjustment;
    if (attemptedCandidates.has(nextCandidate)) {
      // Spring-forward gaps oscillate between the wall clocks on either side
      // of the transition. Match Temporal's compatible disambiguation by
      // moving the nonexistent local time forward by the gap.
      return [...attemptedCandidates]
        .filter(([, wallClock]) => wallClock > desiredWallClock)
        .sort(
          ([candidateA, wallClockA], [candidateB, wallClockB]) =>
            wallClockA - wallClockB || candidateA - candidateB,
        )[0]?.[0];
    }
    candidate = nextCandidate;
  }
  return undefined;
}

function ibkrTimestampParts(
  value: string | undefined,
): DateTimeParts | undefined {
  if (!value) return undefined;
  const [datePart, timePart = "000000"] = value.split(";");
  if (!datePart || datePart.length !== 8 || timePart.length < 6) {
    return undefined;
  }
  return {
    day: Number(datePart.slice(6, 8)),
    hour: Number(timePart.slice(0, 2)),
    minute: Number(timePart.slice(2, 4)),
    month: Number(datePart.slice(4, 6)),
    second: Number(timePart.slice(4, 6)),
    year: Number(datePart.slice(0, 4)),
  };
}

export function parseIbkrEasternTimestamp(
  value: string | undefined,
): number | undefined {
  const parts = ibkrTimestampParts(value);
  return parts ? easternWallClockToTimestamp(parts) : undefined;
}

export function parseIbkrTimestampAsUtcWallClock(
  value: string | undefined,
): number | undefined {
  const parts = ibkrTimestampParts(value);
  return parts ? utcFromParts(parts) : undefined;
}
