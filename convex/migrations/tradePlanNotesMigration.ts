import { internalMutation } from "../_generated/server";

export const migrateTradePlanConditionsToNotes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tradePlans = await ctx.db.query("tradePlans").collect();

    let migrated = 0;
    for (const plan of tradePlans) {
      const parts: string[] = [];

      // Access raw document fields that may still exist in DB
      const raw = plan as Record<string, unknown>;

      if (raw.entryConditions && typeof raw.entryConditions === "string") {
        parts.push(`Entry Conditions: ${raw.entryConditions}`);
      }
      if (raw.exitConditions && typeof raw.exitConditions === "string") {
        parts.push(`Exit Conditions: ${raw.exitConditions}`);
      }
      if (raw.targetConditions && typeof raw.targetConditions === "string") {
        parts.push(`Target Conditions: ${raw.targetConditions}`);
      }
      if (raw.instrumentNotes && typeof raw.instrumentNotes === "string") {
        parts.push(`Instrument Notes: ${raw.instrumentNotes}`);
      }

      if (parts.length > 0) {
        await ctx.db.insert("tradePlanNotes", {
          content: parts.join("\n"),
          ownerId: plan.ownerId,
          tradePlanId: plan._id,
        });
        migrated++;
      }
    }

    return { migrated, total: tradePlans.length };
  },
});
