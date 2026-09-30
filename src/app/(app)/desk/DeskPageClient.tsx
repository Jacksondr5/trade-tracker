"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { Alert, Badge, EmptyState } from "~/components/ui";
import {
  ELEMENT_AUTHOR_LABELS,
  ELEMENT_STATUS_LABELS,
  ElementChip,
  LIFECYCLE_LABELS,
  formatCompactValue,
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
// Width goes to the columns the desk exists to answer: stop, targets, and
// what has moved since the checkpoint. Identity columns stay as narrow as
// their content.
const COLUMNS: Array<{ label: string; width: string }> = [
  { label: "Ticker", width: "6%" },
  { label: "Portfolio", width: "6%" },
  { label: "State", width: "7%" },
  { label: "Position", width: "15%" },
  { label: "Entry", width: "9%" },
  { label: "Stop", width: "20%" },
  { label: "Targets", width: "12%" },
  { label: "Scenarios", width: "9%" },
  { label: "Since checkpoint", width: "16%" },
];

/** First word of the portfolio name; the full name is on hover. */
function shortPortfolioLabel(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

type DeskLine = NonNullable<DeskRow["checkpoint"]>["entry"][number];

function deskLineText(line: DeskLine, leadWithValue: boolean): string {
  if (leadWithValue && line.value) {
    const formatted = formatCompactValue(line.value);
    const text = line.text.trimStart();
    if (text.startsWith(formatted)) return text;
    return `${formatted} · ${text}`;
  }
  return line.text;
}

function CheckpointCell({
  exempt = false,
  leadWithValue = false,
  lines,
}: {
  exempt?: boolean;
  leadWithValue?: boolean;
  lines: DeskLine[];
}) {
  const line = lines[0];
  const text = line ? deskLineText(line, leadWithValue) : null;
  return (
    <td className="px-3 py-2 text-sm whitespace-nowrap text-olive-12">
      <span className="flex min-w-0 items-center gap-1.5">
        {exempt ? (
          <span className="shrink-0 rounded border border-amber-7 bg-amber-2 px-1 text-[10px] font-medium tracking-wide text-amber-11 uppercase">
            exempt
          </span>
        ) : null}
        {text ? (
          <span className="min-w-0 truncate" title={text}>
            {text}
          </span>
        ) : (
          <span className="text-slate-11">—</span>
        )}
      </span>
    </td>
  );
}

function SinceCheckpointCell({ items }: { items: DeskRow["itemsSinceCheckpoint"] }) {
  const latest = items[items.length - 1];
  if (!latest) {
    return (
      <td className="px-3 py-2 text-sm whitespace-nowrap text-slate-11">—</td>
    );
  }
  const more = items.length - 1;
  const isCounterpart = latest.author === "counterpart";
  const statusClass =
    latest.status === "agreed" ? "text-grass-11" : "text-amber-11";
  return (
    <td className="px-3 py-2 text-sm whitespace-nowrap text-olive-12">
      <span
        className={`flex min-w-0 items-center gap-1.5 ${
          isCounterpart ? "rounded border border-dashed border-blue-7 px-1.5" : ""
        }`}
        title={`${latest.statement} — ${ELEMENT_AUTHOR_LABELS[latest.author]}, ${ELEMENT_STATUS_LABELS[latest.status]}`}
      >
        <span className={`shrink-0 text-[10px] font-medium tracking-wide uppercase ${statusClass}`}>
          {ELEMENT_STATUS_LABELS[latest.status]}
        </span>
        {isCounterpart ? (
          <span className="shrink-0 text-[10px] font-semibold text-blue-11" aria-label="Trade Assistant">
            TA
          </span>
        ) : null}
        <span className="min-w-0 truncate">{latest.statement}</span>
        {more > 0 ? (
          <span className="shrink-0 rounded-full border border-slate-7 bg-slate-3 px-1.5 text-[10px] text-slate-11">
            +{more}
          </span>
        ) : null}
      </span>
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
      <td className="px-3 py-2 whitespace-nowrap">
        <Link
          href={`/threads/${encodeURIComponent(episode.ticker)}`}
          className="text-sm font-medium text-slate-12 hover:underline"
          data-testid={`desk-episode-ticker-link-${episode.id}`}
        >
          {episode.ticker}
        </Link>
      </td>
      <td
        className="truncate px-3 py-2 text-sm whitespace-nowrap text-olive-11"
        title={episode.portfolioName ?? undefined}
      >
        {episode.portfolioName ? shortPortfolioLabel(episode.portfolioName) : "—"}
      </td>
      <td className="px-3 py-2">
        <Badge variant={lifecycleBadgeVariant(episode.lifecycle)}>
          {LIFECYCLE_LABELS[episode.lifecycle]}
        </Badge>
      </td>
      <td className="truncate px-3 py-2 text-sm whitespace-nowrap text-slate-12 tabular-nums">
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
        CHECKPOINT_COLUMNS.map((key) =>
          key === "entry" && episode.lifecycle === "active" ? (
            // The position already says what filled; the entry reasoning
            // lives on the thread page.
            <td
              key={key}
              className="px-3 py-2 text-sm whitespace-nowrap text-slate-11"
              title={row.checkpoint!.entry.map((line) => line.text).join("\n")}
            >
              {row.checkpoint!.entry.length > 0 ? "Filled" : "—"}
            </td>
          ) : (
            <CheckpointCell
              key={key}
              lines={row.checkpoint![key]}
              leadWithValue={key === "stop" || key === "targets"}
              exempt={
                key === "scenarios" && episode.campaignElementExemptions.length > 0
              }
            />
          ),
        )
      ) : (
        <td
          colSpan={CHECKPOINT_COLUMNS.length}
          className="px-3 py-2 text-sm whitespace-nowrap text-slate-11"
        >
          {row.draftVersionNumber !== null
            ? `Draft v${row.draftVersionNumber} awaiting endorsement`
            : ""}
        </td>
      )}
      <SinceCheckpointCell items={row.itemsSinceCheckpoint} />
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
          Showing{" "}
          {desk.groups.reduce((total, group) => total + group.rows.length, 0)}{" "}
          of {desk.liveEpisodeCount} live episodes.
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
              <div className="overflow-hidden">
                <table className="w-full table-fixed">
                  <colgroup>
                    {COLUMNS.map((column) => (
                      <col key={column.label} style={{ width: column.width }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {COLUMNS.map((column) => (
                        <th
                          key={column.label}
                          className="truncate px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-slate-11"
                        >
                          {column.label}
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
