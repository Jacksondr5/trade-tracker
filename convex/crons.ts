import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "scheduled Bravos listing scans",
  { hours: 24 },
  internal.bravos.requestScheduledBravosListingScans,
  {},
);

crons.cron(
  "nightly portfolio price snapshot planning",
  "0 1 * * *",
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
