import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { createIbkrFlexActivities } from "./activities";
import { loadIbkrFlexWorkerConfig } from "./config";

const workflowsPath = fileURLToPath(new URL("./workflows.ts", import.meta.url));

async function run() {
  const config = loadIbkrFlexWorkerConfig();
  const connection = await NativeConnection.connect({
    address: config.temporalAddress,
  });
  const worker = await Worker.create({
    activities: createIbkrFlexActivities(config),
    connection,
    namespace: config.temporalNamespace,
    taskQueue: config.temporalTaskQueue,
    workflowsPath,
  });

  console.log(
    `Starting IBKR Flex worker namespace=${config.temporalNamespace} taskQueue=${config.temporalTaskQueue}`,
  );
  await worker.run();
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
