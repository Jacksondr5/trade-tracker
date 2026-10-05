import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { notFound } from "next/navigation";
import { api } from "~/convex/_generated/api";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import ThreadPageClient from "./ThreadPageClient";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).trim().toUpperCase();
  const token = await getConvexTokenOrThrow();
  const preloadedThread = await preloadQuery(
    api.threads.getThreadPage,
    { ticker },
    { token },
  );

  if (preloadedQueryResult(preloadedThread) === null) {
    notFound();
  }

  return <ThreadPageClient preloadedThread={preloadedThread} ticker={ticker} />;
}
