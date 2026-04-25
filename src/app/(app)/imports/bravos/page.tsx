import { preloadQuery } from "convex/nextjs";
import { api } from "~/convex/_generated/api";
import { DEFAULT_BRAVOS_REVIEW_PAGE_SIZE } from "~/lib/bravos/pagination";
import { getConvexTokenOrThrow } from "~/lib/server/convexAuth";
import BravosReviewPageClient from "./BravosReviewPageClient";

export default async function BravosImportsPage() {
  const token = await getConvexTokenOrThrow();
  const [
    preloadedConnection,
    preloadedReviewItems,
    preloadedSummary,
    preloadedSyncRuns,
    preloadedTradePlans,
  ] = await Promise.all([
    preloadQuery(api.bravos.getBravosConnection, {}, { token }),
    preloadQuery(
      api.bravos.listBravosReviewItems,
      {
        paginationOpts: {
          cursor: null,
          numItems: DEFAULT_BRAVOS_REVIEW_PAGE_SIZE,
        },
      },
      { token },
    ),
    preloadQuery(api.bravos.getBravosReviewSummary, {}, { token }),
    preloadQuery(api.bravos.listRecentBravosSyncRuns, {}, { token }),
    preloadQuery(api.tradePlans.listOpenTradePlans, {}, { token }),
  ]);

  return (
    <BravosReviewPageClient
      preloadedConnection={preloadedConnection}
      preloadedReviewItems={preloadedReviewItems}
      preloadedSummary={preloadedSummary}
      preloadedSyncRuns={preloadedSyncRuns}
      preloadedTradePlans={preloadedTradePlans}
    />
  );
}
