import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { assertOwner, requireUser } from "./lib/auth";

const importTaskModeValidator = v.union(
  v.literal("create"),
  v.literal("follow-up"),
);

const importTaskStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("done"),
  v.literal("error"),
);

const importTaskValidator = v.object({
  _creationTime: v.number(),
  _id: v.id("importTasks"),
  chartUrls: v.optional(v.array(v.string())),
  createdTradePlanId: v.optional(v.id("tradePlans")),
  dismissedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  extractedData: v.optional(v.string()),
  mode: importTaskModeValidator,
  ownerId: v.string(),
  pastedText: v.string(),
  sourceUrl: v.optional(v.string()),
  status: importTaskStatusValidator,
  tradePlanId: v.optional(v.id("tradePlans")),
});

const nonEmptyString = z.string().trim().min(1);
const nullableNonEmptyString = z
  .string()
  .nullable()
  .refine((value) => value === null || value.trim().length > 0, {
    message: "cannot be empty",
  });

const createImportTaskDataSchema = z
  .object({
    entryConditions: nonEmptyString,
    exitConditions: nonEmptyString,
    instrumentNotes: nullableNonEmptyString,
    instrumentSymbol: nonEmptyString,
    instrumentType: nullableNonEmptyString,
    name: nonEmptyString,
    rationale: nonEmptyString,
    targetConditions: nonEmptyString,
  })
  .strict();

const allowedFollowUpFields = [
  "entryConditions",
  "exitConditions",
  "targetConditions",
  "rationale",
  "instrumentNotes",
] as const;

const followUpImportTaskDataSchema = z
  .object({
    fieldUpdates: z.array(
      z
        .object({
          appendText: nonEmptyString,
          field: z.enum(allowedFollowUpFields),
        })
        .strict(),
    ),
    noteContent: z.string().trim(),
    suggestClose: z.boolean(),
  })
  .refine(
    (data) =>
      data.suggestClose ||
      data.fieldUpdates.length > 0 ||
      data.noteContent.length > 0,
    "Follow-up import must make at least one meaningful change",
  )
  .strict();

export const createImportTask = mutation({
  args: {
    chartUrls: v.optional(v.array(v.string())),
    mode: importTaskModeValidator,
    pastedText: v.string(),
    sourceUrl: v.optional(v.string()),
    tradePlanId: v.optional(v.id("tradePlans")),
  },
  returns: v.id("importTasks"),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);

    if (args.mode === "follow-up") {
      if (!args.tradePlanId) {
        throw new ConvexError("tradePlanId is required for follow-up imports");
      }

      assertOwner(
        await ctx.db.get(args.tradePlanId),
        ownerId,
        "Trade plan not found",
      );
    }

    return await ctx.db.insert("importTasks", {
      chartUrls: args.chartUrls?.filter(Boolean),
      mode: args.mode,
      ownerId,
      pastedText: args.pastedText,
      sourceUrl: args.sourceUrl,
      status: "pending",
      tradePlanId: args.tradePlanId,
    });
  },
});

export const completeImportTask = mutation({
  args: {
    extractedData: v.string(),
    taskId: v.id("importTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const task = assertOwner(
      await ctx.db.get(args.taskId),
      ownerId,
      "Import task not found",
    );

    if (task.status !== "pending" && task.status !== "processing") {
      throw new ConvexError(`Cannot complete task in status: ${task.status}`);
    }

    const chartUrls = task.chartUrls?.filter(Boolean);

    if (task.mode === "create") {
      const data = createImportTaskDataSchema.parse(
        JSON.parse(args.extractedData),
      );

      const tradePlanId = await ctx.db.insert("tradePlans", {
        entryConditions: data.entryConditions,
        exitConditions: data.exitConditions,
        instrumentNotes: data.instrumentNotes ?? undefined,
        instrumentSymbol: data.instrumentSymbol.trim().toUpperCase(),
        instrumentType: data.instrumentType ?? undefined,
        name: data.name,
        ownerId,
        rationale: data.rationale,
        sourceUrl: task.sourceUrl,
        status: "active",
        targetConditions: data.targetConditions,
      });

      const noteContent = `Imported from service post${task.sourceUrl ? `: ${task.sourceUrl}` : ""}`;
      await ctx.db.insert("notes", {
        chartUrls: chartUrls && chartUrls.length > 0 ? chartUrls : undefined,
        content: noteContent,
        ownerId,
        tradePlanId,
      });

      await ctx.db.patch(args.taskId, {
        createdTradePlanId: tradePlanId,
        extractedData: args.extractedData,
        status: "done",
      });
    } else {
      const data = followUpImportTaskDataSchema.parse(
        JSON.parse(args.extractedData),
      );

      if (!task.tradePlanId) {
        throw new ConvexError("Follow-up task missing tradePlanId");
      }

      const tradePlan = assertOwner(
        await ctx.db.get(task.tradePlanId),
        ownerId,
        "Trade plan not found",
      );

      const planPatch: Record<string, unknown> = {};
      const updateDate = new Date(task._creationTime).toISOString().slice(0, 10);
      for (const update of data.fieldUpdates) {
        const field = update.field as keyof typeof tradePlan;
        const currentValue =
          (planPatch[update.field] as string | undefined) ??
          (tradePlan[field] as string | undefined) ??
          "";
        const appendedValue = `[${updateDate}] ${update.appendText}`;
        planPatch[update.field] = currentValue
          ? `${currentValue}\n${appendedValue}`
          : appendedValue;
      }
      if (data.suggestClose && tradePlan.status !== "closed") {
        planPatch.status = "closed";
        planPatch.closedAt = Date.now();
      }
      if (Object.keys(planPatch).length > 0) {
        await ctx.db.patch(task.tradePlanId, planPatch);
      }

      await ctx.db.insert("notes", {
        chartUrls: chartUrls && chartUrls.length > 0 ? chartUrls : undefined,
        content: data.noteContent,
        ownerId,
        tradePlanId: task.tradePlanId,
      });

      await ctx.db.patch(args.taskId, {
        createdTradePlanId: task.tradePlanId,
        extractedData: args.extractedData,
        status: "done",
      });
    }

    return null;
  },
});

export const failImportTask = mutation({
  args: {
    error: v.string(),
    taskId: v.id("importTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const task = assertOwner(
      await ctx.db.get(args.taskId),
      ownerId,
      "Import task not found",
    );

    if (task.status !== "pending" && task.status !== "processing") {
      return null;
    }

    await ctx.db.patch(args.taskId, {
      error: args.error,
      status: "error",
    });

    return null;
  },
});

export const dismissImportTask = mutation({
  args: {
    taskId: v.id("importTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const task = assertOwner(
      await ctx.db.get(args.taskId),
      ownerId,
      "Import task not found",
    );

    if (task.status === "pending" || task.status === "processing") {
      throw new ConvexError("Cannot dismiss an active import");
    }

    await ctx.db.patch(args.taskId, {
      dismissedAt: Date.now(),
    });
    return null;
  },
});

export const retryImportTask = mutation({
  args: {
    taskId: v.id("importTasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx);
    const task = assertOwner(
      await ctx.db.get(args.taskId),
      ownerId,
      "Import task not found",
    );

    if (task.status !== "error") {
      throw new ConvexError("Can only retry errored tasks");
    }

    await ctx.db.patch(args.taskId, {
      dismissedAt: undefined,
      error: undefined,
      extractedData: undefined,
      status: "pending",
    });

    return null;
  },
});

export const listImportTasks = query({
  args: {},
  returns: v.array(importTaskValidator),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const tasks = await ctx.db
      .query("importTasks")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();

    return tasks.filter((task) => task.dismissedAt === undefined);
  },
});
