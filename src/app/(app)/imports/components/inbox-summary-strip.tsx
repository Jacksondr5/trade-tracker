interface InboxSummaryStripProps {
  errorCount: number;
  matchedCount: number;
  needsReviewCount: number;
  readyCount: number;
  totalCount: number;
}

function StatSegment({
  color,
  count,
  dataTestId,
  label,
}: {
  color: string;
  count: number;
  dataTestId: string;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm text-olive-11"
      data-testid={dataTestId}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {count} {label}
    </span>
  );
}

export function InboxSummaryStrip({
  errorCount,
  matchedCount,
  needsReviewCount,
  readyCount,
  totalCount,
}: InboxSummaryStripProps) {
  if (totalCount === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-olive-6 bg-olive-2 p-3"
      data-testid="inbox-summary-strip"
    >
      <span
        className="text-sm font-medium text-olive-12"
        data-testid="inbox-summary-total"
      >
        {totalCount} {totalCount === 1 ? "trade" : "trades"} pending review
      </span>
      <span className="hidden h-4 w-px bg-olive-6 sm:inline-block" />
      <StatSegment
        color="bg-grass-9"
        count={readyCount}
        dataTestId="inbox-summary-ready"
        label="ready to accept"
      />
      <StatSegment
        color="bg-amber-9"
        count={needsReviewCount}
        dataTestId="inbox-summary-needs-review"
        label="need review"
      />
      {errorCount > 0 && (
        <StatSegment
          color="bg-red-9"
          count={errorCount}
          dataTestId="inbox-summary-errors"
          label={errorCount === 1 ? "has errors" : "have errors"}
        />
      )}
      <StatSegment
        color="bg-blue-9"
        count={matchedCount}
        dataTestId="inbox-summary-matched"
        label="matched to a plan"
      />
    </div>
  );
}
