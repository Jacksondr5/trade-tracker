import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.cron(
  "nightly portfolio price snapshot planning",
  "0 1 * * *",
  internal.marketData.refreshDailyPriceSnapshots,
  {},
);

crons.cron(
  "nightly IBKR Flex brokerage sync kickoff",
  "0 5 * * *",
  internal.ibkrFlexWorkflow.dispatchNightlySync,
  {},
);

crons.interval(
  "rate-limited market data fetch worker",
  { minutes: 2 },
  internal.marketData.processMarketDataFetchJobs,
  {},
);

export default crons;
