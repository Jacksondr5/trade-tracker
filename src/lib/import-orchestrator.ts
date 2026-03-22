import {
  extractFollowUpPost,
  extractInitiatePost,
} from "~/app/actions/ai-import";
import type { Id } from "~/convex/_generated/dataModel";

type CompleteTaskFn = (args: {
  taskId: Id<"importTasks">;
  extractedData: string;
}) => Promise<null>;

type FailTaskFn = (args: {
  taskId: Id<"importTasks">;
  error: string;
}) => Promise<null>;

let completeFn: CompleteTaskFn | null = null;
let failFn: FailTaskFn | null = null;

export function registerImportMutations(
  complete: CompleteTaskFn,
  fail: FailTaskFn,
) {
  completeFn = complete;
  failFn = fail;
}

export function runImportExtraction(args: {
  taskId: Id<"importTasks">;
  mode: "create" | "follow-up";
  pastedText: string;
}) {
  void (async () => {
    try {
      const result =
        args.mode === "create"
          ? await extractInitiatePost(args.pastedText)
          : await extractFollowUpPost(args.pastedText);

      if (result.success) {
        await completeFn?.({
          taskId: args.taskId,
          extractedData: JSON.stringify(result.data),
        });
      } else {
        await failFn?.({
          taskId: args.taskId,
          error: result.error,
        });
      }
    } catch (error) {
      await failFn?.({
        taskId: args.taskId,
        error:
          error instanceof Error ? error.message : "Import extraction failed",
      });
    }
  })();
}
