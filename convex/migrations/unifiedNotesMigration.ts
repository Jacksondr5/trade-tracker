import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const migrate = internalMutation({
  args: {},
  returns: v.object({
    migrated: v.number(),
    skipped: v.boolean(),
  }),
  handler: async (ctx) => {
    const existingNotes = await ctx.db.query("notes").take(1);
    if (existingNotes.length > 0) {
      console.log("Unified notes migration skipped: notes table already populated");
      return { migrated: 0, skipped: true };
    }

    let migrated = 0;

    // Migrate campaign notes
    const campaignNotes = await ctx.db.query("campaignNotes").collect();
    for (const note of campaignNotes) {
      await ctx.db.insert("notes", {
        campaignId: note.campaignId,
        content: note.content,
        ownerId: note.ownerId,
      });
      migrated++;
    }
    console.log(`Migrated ${migrated} campaign notes`);

    // Migrate trade plan notes
    let tradePlanCount = 0;
    const tradePlanNotes = await ctx.db.query("tradePlanNotes").collect();
    for (const note of tradePlanNotes) {
      await ctx.db.insert("notes", {
        content: note.content,
        ownerId: note.ownerId,
        tradePlanId: note.tradePlanId,
      });
      tradePlanCount++;
    }
    console.log(`Migrated ${tradePlanCount} trade plan notes`);
    migrated += tradePlanCount;

    // Migrate general notes
    let generalCount = 0;
    const generalNotes = await ctx.db.query("generalNotes").collect();
    for (const note of generalNotes) {
      await ctx.db.insert("notes", {
        content: note.content,
        ownerId: note.ownerId,
      });
      generalCount++;
    }
    console.log(`Migrated ${generalCount} general notes`);
    migrated += generalCount;

    // Migrate inline trade notes
    let tradeCount = 0;
    const trades = await ctx.db.query("trades").collect();
    for (const trade of trades) {
      if (trade.notes && trade.notes.trim()) {
        await ctx.db.insert("notes", {
          content: trade.notes.trim(),
          ownerId: trade.ownerId,
          tradeId: trade._id,
        });
        tradeCount++;
      }
    }
    console.log(`Migrated ${tradeCount} inline trade notes`);
    migrated += tradeCount;

    console.log(`Total migrated: ${migrated} notes`);
    return { migrated, skipped: false };
  },
});
