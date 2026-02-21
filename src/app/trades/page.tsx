import { auth } from "@clerk/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import TradesPageClient from "./TradesPageClient";

export default async function TradesPage() {
  const now = () => new Date().toISOString();

  console.log(`[${now()}] Calling auth()`);
  const authState = await auth();
  console.log(`[${now()}] auth() resolved`);

  console.log(`[${now()}] Getting token (Clerk convex template)`);
  const token = await authState.getToken({ template: "convex" });
  console.log(`[${now()}] Token acquired`);

  if (!token) {
    throw new Error(
      "Missing Clerk token for Convex. Ensure the Clerk JWT template named 'convex' is configured.",
    );
  }

  const [preloadedTrades, preloadedTradePlans] = await Promise.all([
    preloadQuery(api.trades.listTrades, {}, { token }),
    preloadQuery(api.tradePlans.listTradePlans, {}, { token }),
  ]);

  return (
    <TradesPageClient
      preloadedTrades={preloadedTrades}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
