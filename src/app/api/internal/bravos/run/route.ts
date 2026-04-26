import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { env } from "~/env";
import { extractBravosProposal } from "~/lib/bravos/ai-extraction";
import { captureBrowserbasePage } from "~/lib/bravos/browserbase";
import {
  extractBravosListingPage,
  extractBravosPostPayload,
} from "~/lib/bravos/scraper";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_LISTING_SCAN_PAGES = 3;

const workerRequestSchema = z.object({
  syncRunId: z.string(),
});

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function processBravosPost(args: {
  convex: ConvexHttpClient;
  contextId?: string;
  fetchSource: "direct_post_fetch" | "listing_scan" | "scheduled_scan";
  listingUrl?: string;
  sourcePublishedAt?: number;
  sourceUrl: string;
  syncRunId: Id<"bravosSyncRuns">;
}) {
  const capture = await captureBrowserbasePage({
    contextId: args.contextId,
    sourceUrl: args.sourceUrl,
  });
  if (!capture.postHtml) {
    throw new Error("Could not find Bravos post body at body article main article");
  }
  const payload = extractBravosPostPayload(capture.postHtml, {
    baseUrl: capture.finalUrl,
    sourceUrl: capture.finalUrl,
  });
  const inferred = await extractBravosProposal({
    rawText: payload.rawText,
    sourcePostDate: payload.sourcePostDate,
    sourceUrl: payload.sourceUrl ?? capture.finalUrl,
    title: payload.title,
  });

  return await args.convex.mutation(api.bravos.upsertReviewItemForWorker, {
    classification: inferred.classification,
    aiOutput: inferred.aiOutput,
    fetchSource: args.fetchSource,
    imageUrls: payload.imageUrls,
    listingUrl: args.listingUrl,
    proposedAction: inferred.proposedAction,
    rawText: payload.rawText,
    sourcePostDate: payload.sourcePostDate ?? inferred.sourcePostDate,
    sourceTitle: payload.title,
    sourcePublishedAt: payload.sourcePublishedAt ?? args.sourcePublishedAt,
    sourceUrl: payload.sourceUrl ?? capture.finalUrl,
    suggestedTradePlanReason: inferred.suggestedTradePlanReason,
    syncRunId: args.syncRunId,
    workerSecret: env.BRAVOS_WORKER_SECRET,
  });
}

async function processListingScan(args: {
  convex: ConvexHttpClient;
  contextId?: string;
  fetchSource: "listing_scan" | "scheduled_scan";
  listingUrl: string;
  syncRunId: Id<"bravosSyncRuns">;
}) {
  let pageUrl: string | undefined = args.listingUrl;
  const collectedUnseenPosts: Array<{
    sourcePublishedAt?: number;
    sourceUrl: string;
  }> = [];
  let foundSeenBoundary = false;

  for (let pageNumber = 1; pageNumber <= MAX_LISTING_SCAN_PAGES; pageNumber += 1) {
    if (!pageUrl) {
      break;
    }

    const capture = await captureBrowserbasePage({
      contextId: args.contextId,
      sourceUrl: pageUrl,
    });
    const listingPage = extractBravosListingPage(capture.html, {
      baseUrl: capture.finalUrl,
    });

    if (listingPage.posts.length === 0) {
      throw new Error(`No Bravos posts found on listing page ${pageNumber}`);
    }

    const unseenPosts = await args.convex.mutation(
      api.bravos.filterUnseenListingPostsForWorker,
      {
        posts: listingPage.posts.map((post) => ({
          sourcePublishedAt: post.sourcePublishedAt,
          sourceUrl: post.sourceUrl,
        })),
        syncRunId: args.syncRunId,
        workerSecret: env.BRAVOS_WORKER_SECRET,
      },
    );

    collectedUnseenPosts.push(...unseenPosts);

    if (unseenPosts.length < listingPage.posts.length) {
      foundSeenBoundary = true;
      break;
    }

    if (!listingPage.nextPageUrl) {
      break;
    }
    pageUrl = listingPage.nextPageUrl;
  }

  if (!foundSeenBoundary) {
    throw new Error(
      `Bravos listing scan did not find a previously seen post within ${MAX_LISTING_SCAN_PAGES} pages; baseline may be missing or too old.`,
    );
  }

  let processedCount = 0;
  for (const post of [...collectedUnseenPosts].reverse()) {
    await processBravosPost({
      convex: args.convex,
      contextId: args.contextId,
      fetchSource: args.fetchSource,
      listingUrl: args.listingUrl,
      sourcePublishedAt: post.sourcePublishedAt,
      sourceUrl: post.sourceUrl,
      syncRunId: args.syncRunId,
    });
    processedCount += 1;
  }

  return processedCount;
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token || token !== env.BRAVOS_WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = workerRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid worker payload" }, { status: 400 });
  }

  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  const syncRunId = parsed.data.syncRunId as Id<"bravosSyncRuns">;

  try {
    const loaded = await convex.mutation(api.bravos.loadRunForWorker, {
      syncRunId,
      workerSecret: env.BRAVOS_WORKER_SECRET,
    });
    if (!loaded) {
      return NextResponse.json({ error: "Sync run not found" }, { status: 404 });
    }
    await convex.mutation(api.bravos.markRunProcessingForWorker, {
      syncRunId,
      workerSecret: env.BRAVOS_WORKER_SECRET,
    });

    if (loaded.run.kind === "direct_post_fetch") {
      if (!loaded.run.requestedSourceUrl) {
        throw new Error("Direct Bravos post fetch requires a source URL");
      }
      const reviewItemId = await processBravosPost({
        convex,
        contextId: loaded.connection?.browserbaseContextId,
        fetchSource: "direct_post_fetch",
        sourceUrl: loaded.run.requestedSourceUrl,
        syncRunId,
      });
      await convex.mutation(api.bravos.markRunDoneForWorker, {
        syncRunId,
        workerSecret: env.BRAVOS_WORKER_SECRET,
      });

      return NextResponse.json({ reviewItemId, syncRunId });
    }

    if (loaded.run.kind === "listing_scan" || loaded.run.kind === "scheduled_scan") {
      const listingUrl =
        loaded.run.requestedSourceUrl ?? loaded.connection?.listingUrl;
      if (!listingUrl) {
        throw new Error("Bravos listing scan requires a listing URL");
      }
      const processedCount = await processListingScan({
        convex,
        contextId: loaded.connection?.browserbaseContextId,
        fetchSource: loaded.run.kind,
        listingUrl,
        syncRunId,
      });
      await convex.mutation(api.bravos.markRunDoneForWorker, {
        syncRunId,
        workerSecret: env.BRAVOS_WORKER_SECRET,
      });

      return NextResponse.json({ processedCount, syncRunId });
    }

    throw new Error(`Unsupported Bravos sync run kind: ${loaded.run.kind}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Bravos worker failed";
    await convex.mutation(api.bravos.markRunErrorForWorker, {
      error: message,
      markConnectionNeedsReconnect: /auth|login|unauthorized/i.test(message),
      syncRunId,
      workerSecret: env.BRAVOS_WORKER_SECRET,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
