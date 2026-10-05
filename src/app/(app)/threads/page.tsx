import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import ThreadsPageClient from "./ThreadsPageClient";

export default async function ThreadsPage() {
  const token = await getConvexTokenOrThrow();
  const preloadedThreads = await preloadQuery(
    api.threads.listThreads,
    {},
    { token },
  );

  return <ThreadsPageClient preloadedThreads={preloadedThreads} />;
}
