import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "scheduled Bravos listing scans",
  { hours: 24 },
  internal.bravos.requestScheduledBravosListingScans,
  {},
);

crons.daily(
  "nightly portfolio price snapshot refresh",
  { hourUTC: 1, minuteUTC: 0 },
  internal.marketData.refreshDailyPriceSnapshots,
  {},
);

export default crons;
