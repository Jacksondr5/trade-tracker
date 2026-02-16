import { cronJobs } from "convex/server";
import { makeFunctionReference } from "convex/server";

const crons = cronJobs();

crons.interval(
  "scheduled-brokerage-import-sync",
  { minutes: 15 },
  makeFunctionReference<"mutation">("imports:runScheduledSync"),
);

export default crons;
