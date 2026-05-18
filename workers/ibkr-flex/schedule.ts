import {
  Client,
  Connection,
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import { loadIbkrFlexWorkerConfig } from "./config";

const DAILY_SCHEDULE_ID = "trade-tracker-ibkr-flex-daily";

async function ensureSchedule() {
  const config = loadIbkrFlexWorkerConfig();
  const connection = await Connection.connect({
    address: config.temporalAddress,
  });
  const client = new Client({
    connection,
    namespace: config.temporalNamespace,
  });
  const scheduleOptions = {
    action: {
      args: [
        {
          scheduleId: DAILY_SCHEDULE_ID,
          timezone: "America/New_York",
        },
      ],
      taskQueue: config.temporalTaskQueue,
      type: "startWorkflow" as const,
      workflowType: "dailyIbkrFlexBrokerageSyncWorkflow",
    },
    policies: {
      overlap: ScheduleOverlapPolicy.SKIP,
    },
    scheduleId: DAILY_SCHEDULE_ID,
    spec: {
      calendars: [{ hour: 1, minute: 0 }],
      timeZoneName: "America/New_York",
    },
  };
  const scheduleUpdateOptions = {
    action: scheduleOptions.action,
    policies: scheduleOptions.policies,
    spec: scheduleOptions.spec,
  };

  try {
    await client.schedule.create(scheduleOptions);
    console.log(`Created Temporal schedule ${DAILY_SCHEDULE_ID}`);
  } catch (error) {
    if (!(error instanceof ScheduleAlreadyRunning)) throw error;
    const handle = client.schedule.getHandle(DAILY_SCHEDULE_ID);
    await handle.update((previous) => ({
      ...scheduleUpdateOptions,
      state: previous.state,
    }));
    console.log(`Updated Temporal schedule ${DAILY_SCHEDULE_ID}`);
  }
}

ensureSchedule().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
