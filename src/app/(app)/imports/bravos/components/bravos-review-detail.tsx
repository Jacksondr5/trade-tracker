import { Button } from "~/components/ui";
import { Select } from "~/components/ui/select";
import {
  BRAVOS_REVIEW_TEST_IDS,
  getBravosRunRetryTestId,
} from "../../../../../../shared/e2e/testIds";

export interface BravosTradePlanOption {
  _id: string;
  instrumentSymbol: string;
  name: string;
  status: string;
}

export interface BravosReviewItem {
  _id: string;
  aiOutput?: string;
  classification?: "follow_up" | "initiate" | "unknown";
  imageUrls: string[];
  lastFetchedAt?: number;
  proposedAction: {
    instrumentSymbol?: string;
    kind: string;
    targetTradePlanId?: string;
  };
  rawText: string;
  reviewState: string;
  sourcePostDate?: string;
  sourceUrl: string;
  sourceTitle?: string;
  syncRunId?: string;
}

type AiOutputValue =
  | boolean
  | null
  | number
  | string
  | AiOutputValue[]
  | { [key: string]: AiOutputValue };

const AI_OUTPUT_LABELS: Record<string, string> = {
  classification: "Classification",
  confidence: "Confidence",
  content: "Content",
  entryConditions: "Entry Conditions",
  exitConditions: "Exit Conditions",
  field: "Trade Plan Field",
  fieldUpdates: "Proposed Updates",
  instrumentNotes: "Instrument Notes",
  instrumentSymbol: "Symbol",
  instrumentType: "Instrument Type",
  kind: "Action Type",
  name: "Name",
  noteContent: "Note",
  proposal: "Proposal Details",
  rationale: "Rationale",
  reason: "Reason",
  sourcePostDate: "Source Date",
  targetConditions: "Target Conditions",
  targetTradePlanId: "Target Trade Plan",
  text: "Update",
};

const AI_OUTPUT_VALUE_LABELS: Record<string, string> = {
  apply_follow_up: "Follow Up",
  create_trade_plan: "New Trade Plan",
  follow_up: "Follow Up",
  note_only: "Note Only",
};

const WIDE_AI_OUTPUT_KEYS = new Set([
  "content",
  "entryConditions",
  "exitConditions",
  "fieldUpdates",
  "instrumentNotes",
  "noteContent",
  "proposal",
  "rationale",
  "reason",
  "targetConditions",
  "text",
]);

function parseAiOutput(value: string | undefined): AiOutputValue | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as AiOutputValue;
  } catch {
    return value;
  }
}

function formatLabel(value: string): string {
  const customLabel = AI_OUTPUT_LABELS[value];
  if (customLabel) {
    return customLabel;
  }

  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatScalarValue(value: boolean | null | number | string): string {
  if (value === null || value === "") {
    return "None";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return String(value);
  }

  const customLabel = AI_OUTPUT_VALUE_LABELS[value];
  if (customLabel) {
    return customLabel;
  }

  if (/^[a-z][a-z0-9_]*$/.test(value)) {
    return formatLabel(value);
  }

  return value;
}

function isLongScalarValue(value: AiOutputValue): boolean {
  return typeof value === "string" && value.length > 80;
}

function AiOutputFields({
  data,
  depth = 0,
}: {
  data: AiOutputValue;
  depth?: number;
}) {
  if (
    data === null ||
    typeof data === "boolean" ||
    typeof data === "number" ||
    typeof data === "string"
  ) {
    return <span>{formatScalarValue(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span>None</span>;
    }

    return (
      <ul className="divide-olive-4 divide-y">
        {data.map((item, index) => (
          <li className="py-3 first:pt-0 last:pb-0" key={index}>
            <AiOutputFields data={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  const entries = Object.entries(data);
  return (
    <dl
      className={
        depth === 0
          ? "grid gap-x-6 gap-y-4 text-sm md:grid-cols-2"
          : "grid gap-x-6 gap-y-3 text-sm md:grid-cols-2"
      }
    >
      {entries.map(([key, value]) => {
        const shouldSpanColumns =
          WIDE_AI_OUTPUT_KEYS.has(key) ||
          Array.isArray(value) ||
          (typeof value === "object" && value !== null) ||
          isLongScalarValue(value);

        return (
          <div
            className={shouldSpanColumns ? "min-w-0 md:col-span-2" : "min-w-0"}
            key={key}
          >
            <dt className="text-olive-11">{formatLabel(key)}</dt>
            <dd className="text-olive-12 mt-1 break-words">
              <AiOutputFields data={value} depth={depth + 1} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export interface BravosSyncRun {
  _id: string;
  completedAt?: number;
  error?: string;
  kind: string;
  requestedAt: number;
  requestedSourceUrl?: string;
  startedAt?: number;
  status: "done" | "error" | "processing" | "queued";
}

export type BravosQueueRow =
  | {
      id: string;
      latestRun?: BravosSyncRun;
      review: BravosReviewItem;
      type: "review";
    }
  | {
      id: string;
      run: BravosSyncRun;
      type: "run";
    };

function formatRunTime(timestamp: number | undefined): string {
  if (timestamp === undefined) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}

export function BravosReviewDetail({
  isApproving,
  isDismissing,
  onApprove,
  onDismiss,
  onRetryRun,
  onTargetTradePlanChange,
  retryingRunId,
  row,
  selectedTargetTradePlanId,
  tradePlans,
}: {
  isApproving: boolean;
  isDismissing: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onRetryRun: (runId: string) => void;
  onTargetTradePlanChange: (tradePlanId: string) => void;
  retryingRunId: string | null;
  row: BravosQueueRow | null;
  selectedTargetTradePlanId: string;
  tradePlans: BravosTradePlanOption[];
}) {
  if (!row) {
    return (
      <section
        className="border-olive-4 bg-olive-2 rounded-md border p-6 pl-16 sm:pl-6"
        data-testid={BRAVOS_REVIEW_TEST_IDS.detailPanel}
      >
        <p className="text-olive-11 text-sm">
          Select a Bravos item to review its source evidence and status.
        </p>
      </section>
    );
  }

  if (row.type === "run") {
    const run = row.run;
    return (
      <section
        className="border-olive-4 bg-olive-2 rounded-md border p-6 pl-16 sm:pl-6"
        data-testid={BRAVOS_REVIEW_TEST_IDS.detailPanel}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-olive-12 text-base font-medium">Sync run</h2>
            <p className="text-olive-11 mt-1 truncate text-sm">
              {run.requestedSourceUrl ?? formatLabel(run.kind)}
            </p>
          </div>
          {run.status === "done" ? null : (
            <Button
              dataTestId={getBravosRunRetryTestId(run._id)}
              isLoading={retryingRunId === run._id}
              onClick={() => onRetryRun(run._id)}
              type="button"
              variant="outline"
            >
              Retry
            </Button>
          )}
        </div>

        <dl className="border-olive-4 mt-5 grid gap-3 border-t pt-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-olive-11">State</dt>
            <dd className="text-olive-12 mt-1">{formatLabel(run.status)}</dd>
          </div>
          <div>
            <dt className="text-olive-11">Kind</dt>
            <dd className="text-olive-12 mt-1">{formatLabel(run.kind)}</dd>
          </div>
          <div>
            <dt className="text-olive-11">Requested</dt>
            <dd className="text-olive-12 mt-1">
              {formatRunTime(run.requestedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-olive-11">Started</dt>
            <dd className="text-olive-12 mt-1">
              {formatRunTime(run.startedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-olive-11">Completed</dt>
            <dd className="text-olive-12 mt-1">
              {formatRunTime(run.completedAt)}
            </dd>
          </div>
        </dl>

        {run.error ? (
          <div className="mt-5">
            <h3 className="text-red-11 text-sm font-medium">Error</h3>
            <pre className="border-red-7 bg-red-2 text-red-12 mt-2 max-h-64 overflow-auto rounded-md border p-3 whitespace-pre-wrap text-sm">
              {run.error}
            </pre>
          </div>
        ) : null}
      </section>
    );
  }

  const item = row.review;
  const latestRun = row.latestRun;

  return (
    <ReviewProposalDetail
      isApproving={isApproving}
      isDismissing={isDismissing}
      item={item}
      latestRun={latestRun}
      onApprove={onApprove}
      onDismiss={onDismiss}
      onTargetTradePlanChange={onTargetTradePlanChange}
      selectedTargetTradePlanId={selectedTargetTradePlanId}
      tradePlans={tradePlans}
    />
  );
}

function ReviewProposalDetail({
  isApproving,
  isDismissing,
  item,
  latestRun,
  onApprove,
  onDismiss,
  onTargetTradePlanChange,
  selectedTargetTradePlanId,
  tradePlans,
}: {
  isApproving: boolean;
  isDismissing: boolean;
  item: BravosReviewItem;
  latestRun?: BravosSyncRun;
  onApprove: () => void;
  onDismiss: () => void;
  onTargetTradePlanChange: (tradePlanId: string) => void;
  selectedTargetTradePlanId: string;
  tradePlans: BravosTradePlanOption[];
}) {
  const needsTargetTradePlan = item.proposedAction.kind === "apply_follow_up";
  const canApprove =
    (item.reviewState === "ready" || item.reviewState === "needs_attention") &&
    (!needsTargetTradePlan || selectedTargetTradePlanId !== "");
  const isTerminal =
    item.reviewState === "approved" || item.reviewState === "dismissed";
  const aiOutput = parseAiOutput(item.aiOutput);

  return (
    <section
      className="border-olive-4 bg-olive-2 rounded-md border p-6 pl-16 sm:pl-6"
      data-testid={BRAVOS_REVIEW_TEST_IDS.detailPanel}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-olive-12 text-base font-medium">
            {item.sourceTitle ?? "Review proposal"}
          </h2>
          <a
            className="text-blue-9 mt-1 block truncate text-sm hover:underline"
            href={item.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            {item.sourceUrl}
          </a>
        </div>
        {isTerminal ? null : (
          <div className="flex gap-2">
            <Button
              dataTestId={BRAVOS_REVIEW_TEST_IDS.dismissButton}
              isLoading={isDismissing}
              onClick={onDismiss}
              type="button"
              variant="outline"
            >
              Dismiss
            </Button>
            <Button
              dataTestId={BRAVOS_REVIEW_TEST_IDS.approveButton}
              disabled={!canApprove}
              isLoading={isApproving}
              onClick={onApprove}
              type="button"
            >
              Approve
            </Button>
          </div>
        )}
      </div>

      <dl className="border-olive-4 mt-5 grid gap-3 border-t pt-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-olive-11">State</dt>
          <dd className="text-olive-12 mt-1">
            {formatLabel(item.reviewState)}
          </dd>
        </div>
        <div>
          <dt className="text-olive-11">Proposal</dt>
          <dd className="text-olive-12 mt-1">
            {formatLabel(item.proposedAction.kind)}
          </dd>
        </div>
        <div>
          <dt className="text-olive-11">Source date</dt>
          <dd className="text-olive-12 mt-1">
            {item.sourcePostDate ?? "Unknown"}
          </dd>
        </div>
        {latestRun ? (
          <div>
            <dt className="text-olive-11">Latest run</dt>
            <dd className="text-olive-12 mt-1">
              {formatLabel(latestRun.status)}
            </dd>
          </div>
        ) : null}
      </dl>

      {needsTargetTradePlan ? (
        <div className="border-olive-4 mt-5 border-t pt-5">
          <label
            className="text-olive-12 text-sm font-medium"
            htmlFor="bravos-target-trade-plan"
          >
            Target trade plan
          </label>
          <Select
            className="mt-2"
            dataTestId={BRAVOS_REVIEW_TEST_IDS.targetTradePlanSelect}
            disabled={isTerminal}
            id="bravos-target-trade-plan"
            onChange={(event) => onTargetTradePlanChange(event.target.value)}
            value={selectedTargetTradePlanId}
          >
            <option value="">Choose a trade plan</option>
            {tradePlans.map((tradePlan) => (
              <option key={tradePlan._id} value={tradePlan._id}>
                {tradePlan.instrumentSymbol} - {tradePlan.name} (
                {formatLabel(tradePlan.status)})
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {aiOutput ? (
        <div className="border-olive-4 mt-5 border-t pt-5">
          <h3 className="text-olive-12 text-sm font-medium">AI output</h3>
          <div className="text-olive-12 mt-3">
            <AiOutputFields data={aiOutput} />
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-olive-12 text-sm font-medium">Captured text</h3>
        <pre className="border-olive-4 bg-olive-1 text-olive-12 mt-2 max-h-80 overflow-auto rounded-md border p-3 whitespace-pre-wrap text-sm">
          {item.rawText}
        </pre>
      </div>
    </section>
  );
}
