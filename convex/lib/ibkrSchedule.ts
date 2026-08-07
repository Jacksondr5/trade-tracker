const EASTERN_TIME_ZONE = "America/New_York";
export const ONE_HOUR_MS = 60 * 60 * 1000;

type EasternDateTime = {
  day: number;
  hour: number;
  month: number;
  year: number;
};

function easternDateTime(now: number): EasternDateTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    month: "2-digit",
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date(now));
  const part = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((item) => item.type === type)?.value;
    if (!value) throw new Error(`Missing Eastern ${type}`);
    return Number(value);
  };
  return {
    day: part("day"),
    hour: part("hour"),
    month: part("month"),
    year: part("year"),
  };
}

export function getPriorBusinessDate(now: number): string {
  const eastern = easternDateTime(now);
  const prior = new Date(
    Date.UTC(eastern.year, eastern.month - 1, eastern.day - 1),
  );
  while (prior.getUTCDay() === 0 || prior.getUTCDay() === 6) {
    prior.setUTCDate(prior.getUTCDate() - 1);
  }
  return prior.toISOString().slice(0, 10);
}

/**
 * The cron fires once at 05:00 UTC. That is 01:00 during daylight time and
 * 00:00 during standard time, when this returns a durable one-hour delay.
 */
export function getNightlyKickoffDelayMs(now: number): number {
  const { hour } = easternDateTime(now);
  if (hour === 1) return 0;
  if (hour === 0) return ONE_HOUR_MS;
  throw new Error(`Unexpected Eastern hour ${hour} for the 05:00 UTC cron`);
}

export function getIbkrPollDelayMs(args: {
  attempt: number;
  initialPollIntervalMs: number;
  maxPollIntervalMs: number;
}): number {
  return Math.min(
    args.maxPollIntervalMs,
    args.initialPollIntervalMs * 2 ** Math.max(0, args.attempt - 1),
  );
}
