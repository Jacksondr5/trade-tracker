"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { Alert, Badge, EmptyState } from "~/components/ui";
import {
  ElementChip,
  LIFECYCLE_LABELS,
  PlanLineText,
  formatPosition,
  lifecycleBadgeVariant,
  type DeskGroup,
  type DeskRow,
} from "~/components/threads";
import { api } from "~/convex/_generated/api";
import { formatCurrency } from "~/lib/format";
import {
  APP_PAGE_TITLES,
  DESK_TEST_IDS,
  getDeskCampaignGroupTestId,
  getDeskEpisodeRowTestId,
} from "../../../../shared/e2e/testIds";

const CHECKPOINT_COLUMNS = ["entry", "stop", "targets", "scenarios"] as const;
const COLUMN_LABELS = [
  "Ticker",
  "Portfolio",
  "Lifecycle",
  "Position",
  "Entry",
  "Stop",
  "Targets",
  "Scenarios",
  "Since checkpoint",
];

function CheckpointCell({
  lines,
}: {
  lines: NonNullable<DeskRow["checkpoint"]>["entry"];
}) {
  const line = lines[0];
  return (
    <td className="max-w-xs px-3 py-2 align-top text-sm text-olive-12">
      {line ? <PlanLineText line={line} /> : <span className="text-slate-11">—</span>}
    </td>
  );
}

function DeskEpisodeRow({ row }: { row: DeskRow }) {
  const { episode } = row;
  return (
    <tr
      className="hover:bg-slate-3/40"
      data-testid={getDeskEpisodeRowTestId(episode.id)}
    >
      <td className="px-3 py-2 align-top whitespace-nowrap">
        <Link
          href={`/threads/${encodeURIComponent(episode.ticker)}`}
          className="text-sm font-medium text-slate-12 hover:underline"
          data-testid={`desk-episode-ticker-link-${episode.id}`}
        >
          {episode.ticker}
        </Link>
      </td>
      <td className="px-3 py-2 align-top text-sm whitespace-nowrap text-olive-11">
        {episode.portfolioName ?? "—"}
      </td>
      <td className="px-3 py-2 align-top">
        <Badge variant={lifecycleBadgeVariant(episode.lifecycle)}>
          {LIFECYCLE_LABELS[episode.lifecycle]}
        </Badge>
      </td>
      <td className="px-3 py-2 align-top text-sm whitespace-nowrap text-slate-12 tabular-nums">
        {row.position ? (
          <>
            <Badge
              variant={row.position.direction === "long" ? "success" : "danger"}
              className="mr-1"
            >
              {row.position.direction === "long" ? "Long" : "Short"}
            </Badge>
            {formatPosition(row.position)}
          </>
        ) : (
          <span className="text-slate-11">Flat</span>
        )}
      </td>
      {row.checkpoint ? (
        CHECKPOINT_COLUMNS.map((key) => (
          <CheckpointCell key={key} lines={row.checkpoint![key]} />
        ))
      ) : (
        <td colSpan={CHECKPOINT_COLUMNS.length} className="px-3 py-2 align-top text-sm text-slate-11">
          {row.draftVersionNumber !== null ? `Draft v${row.draftVersionNumber} awaiting endorsement` : ""}
        </td>
      )}
      <td className="px-3 py-2 align-top">
        {row.itemsSinceCheckpoint.length === 0 ? (
          <span className="text-sm text-slate-11">—</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {row.itemsSinceCheckpoint.map((element) => (
              <ElementChip key={element.id} element={element} />
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

function CampaignGroupHeader({ campaign }: { campaign: DeskGroup["campaign"] }) {
  if (!campaign) {
    return (
      <div className="flex items-center gap-3 border-b border-slate-6 bg-slate-2 px-3 py-2">
        <span className="text-sm font-semibold text-slate-12">
          Not in a campaign
        </span>
      </div>
    );
  }
  const rules = campaign.rules.filter(
    (rule) => rule.status === "agreed" || rule.status === "proposed",
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-6 bg-slate-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="text-sm font-semibold text-slate-12 hover:underline"
        >
          {campaign.name}
        </Link>
        {campaign.benchmark ? (
          <span className="text-sm text-slate-11 tabular-nums">
            Benchmark{" "}
            <Link
              href={`/threads/${encodeURIComponent(campaign.benchmark.ticker)}`}
              className="font-medium text-slate-12 hover:underline"
            >
              {campaign.benchmark.ticker}
            </Link>
            {campaign.benchmark.latestClose
              ? ` ${formatCurrency(campaign.benchmark.latestClose.close)} (${campaign.benchmark.latestClose.date})`
              : " · no close yet"}
          </span>
        ) : null}
      </div>
      {rules.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {rules.map((rule) => (
            <ElementChip key={rule.id} element={rule} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function DeskPageClient({
  preloadedDesk,
}: {
  preloadedDesk: Preloaded<typeof api.threads.getDesk>;
}) {
  const desk = usePreloadedQuery(preloadedDesk);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-2xl font-bold text-slate-12"
          data-testid={APP_PAGE_TITLES.desk}
        >
          Desk
        </h1>
      </div>

      {desk.truncated ? (
        <Alert variant="info" className="mb-4">
          Showing the first {desk.liveEpisodeCount} live episodes.
        </Alert>
      ) : null}

      {desk.liveEpisodeCount === 0 ? (
        <EmptyState
          dataTestId={DESK_TEST_IDS.emptyState}
          title="No live episodes"
          description="Live episodes appear here once a thread has an idea, a watching setup, or an open position."
          ctaHref="/threads"
          ctaLabel="Open thread"
        />
      ) : (
        <div className="space-y-6">
          {desk.groups.map((group) => (
            <section
              key={group.campaign?.id ?? "none"}
              className="overflow-hidden rounded-lg border border-slate-6 bg-slate-2"
              data-testid={
                group.campaign
                  ? getDeskCampaignGroupTestId(group.campaign.id)
                  : DESK_TEST_IDS.campaignGroupNone
              }
            >
              <CampaignGroupHeader campaign={group.campaign} />
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead>
                    <tr>
                      {COLUMN_LABELS.map((label) => (
                        <th
                          key={label}
                          className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-slate-11"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-6 bg-slate-1">
                    {group.rows.map((row) => (
                      <DeskEpisodeRow key={row.episode.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
