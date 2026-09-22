import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import DeskPageClient from "./DeskPageClient";

export default async function DeskPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedDesk = await preloadQuery(api.threads.getDesk, {}, { token });

  return <DeskPageClient preloadedDesk={preloadedDesk} />;
}
