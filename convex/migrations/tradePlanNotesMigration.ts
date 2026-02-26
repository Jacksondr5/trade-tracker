import { internalMutation } from "../_generated/server";

export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tradePlans = await ctx.db.query("tradePlans").collect();
    let migrated = 0;
    for (const plan of tradePlans) {
      const raw = plan as Record<string, unknown>;
      const parts: string[] = [];
      if (raw.entryConditions) parts.push(`Entry Conditions: ${raw.entryConditions}`);
      if (raw.exitConditions) parts.push(`Exit Conditions: ${raw.exitConditions}`);
      if (raw.targetConditions) parts.push(`Target Conditions: ${raw.targetConditions}`);
      if (raw.instrumentNotes) parts.push(`Instrument Notes: ${raw.instrumentNotes}`);
      if (raw.rationale) parts.push(`Rationale: ${raw.rationale}`);

      if (parts.length > 0) {
        await ctx.db.insert("tradePlanNotes", {
          content: parts.join("\n"),
          ownerId: plan.ownerId,
          tradePlanId: plan._id,
        });
        migrated++;
      }
    }
    console.log(`Migrated ${migrated} trade plans to notes`);
  },
});
