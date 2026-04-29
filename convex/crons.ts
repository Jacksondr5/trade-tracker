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
  "nightly portfolio price snapshot planning",
  { hourUTC: 1, minuteUTC: 0 },
  internal.marketData.refreshDailyPriceSnapshots,
  {},
);

crons.interval(
  "rate-limited market data fetch worker",
  { minutes: 2 },
  internal.marketData.processMarketDataFetchJobs,
  {},
);

export default crons;
