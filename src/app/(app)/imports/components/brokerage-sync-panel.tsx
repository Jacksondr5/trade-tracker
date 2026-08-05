"use client";

import type { Preloaded } from "convex/react";
import { useMutation, usePreloadedQuery } from "convex/react";
import {
  AlertTriangle,
  ChevronDown,
  Pause,
  Play,
  Settings2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  Alert,
  Badge,
  Button,
  Card,
  type BadgeProps,
  useAppForm,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import { formatDate } from "~/lib/format";
import { cn } from "~/lib/utils";
import { IMPORTS_INDEX_TEST_IDS } from "../../../../../shared/e2e/testIds";

const connectionSchema = z.object({
  accountId: z
    .string()
    .trim()
    .max(40, "Account ID must be 40 characters or less"),
  label: z.string().trim().max(80, "Label must be 80 characters or less"),
  queryId: z
    .string()
    .trim()
    .min(1, "Flex query ID is required")
    .regex(/^\d+$/, "Flex query ID must contain only numbers"),
  tokenExpiresOn: z
    .string()
    .refine(
      (value) =>
        value === "" || !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
      "Enter a valid expiration date",
    ),
  tokenLabel: z
    .string()
    .trim()
    .max(80, "Token label must be 80 characters or less"),
});

type ConnectionFormValues = z.infer<typeof connectionSchema>;
type BadgeVariant = NonNullable<BadgeProps["variant"]>;
type ConnectionStatus = "active" | "paused" | "needs_setup" | "error";

function validateConnectionField(
  field: keyof ConnectionFormValues,
  value: string,
): string | undefined {
  const result = connectionSchema.shape[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

function getStatusPresentation(status: ConnectionStatus): {
  label: string;
  variant: BadgeVariant;
} {
  switch (status) {
    case "active":
      return { label: "Active", variant: "success" };
    case "paused":
      return { label: "Paused", variant: "neutral" };
    case "error":
      return { label: "Needs attention", variant: "danger" };
    case "needs_setup":
    default:
      return { label: "Not configured", variant: "warning" };
  }
}

function toDateInputValue(timestamp?: number): string {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function toEndOfUtcDay(date: string): number | undefined {
  return date ? Date.parse(`${date}T23:59:59.999Z`) : undefined;
}

export function BrokerageSyncPanel({
  preloadedStatus,
}: {
  preloadedStatus: Preloaded<
    typeof api.brokerageIngestion.getBrokerageIngestionStatus
  >;
}) {
  const status = usePreloadedQuery(preloadedStatus);
  const connection = status.connections[0];
  const [isEditing, setIsEditing] = useState(connection === undefined);
  const [showIssues, setShowIssues] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    variant: "error" | "success";
  } | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const connectionAccountId = connection?.accountId ?? "";
  const connectionLabel = connection?.label ?? "";
  const connectionQueryId = connection?.queryId ?? "";
  const connectionStatus = connection?.status;
  const connectionTokenExpiresOn = toDateInputValue(
    connection?.tokenExpiresAt,
  );
  const connectionTokenLabel = connection?.tokenLabel ?? "";
  const connectionFormValues = useMemo(
    () => ({
      accountId: connectionAccountId,
      label: connectionLabel,
      queryId: connectionQueryId,
      tokenExpiresOn: connectionTokenExpiresOn,
      tokenLabel: connectionTokenLabel,
    }),
    [
      connectionAccountId,
      connectionLabel,
      connectionQueryId,
      connectionTokenExpiresOn,
      connectionTokenLabel,
    ],
  );

  const upsertConnection = useMutation(
    api.brokerageIngestion.upsertIbkrConnection,
  );
  const pauseConnection = useMutation(
    api.brokerageIngestion.pauseBrokerageConnection,
  );

  const form = useAppForm({
    defaultValues: connectionFormValues satisfies ConnectionFormValues,
    validators: {
      onChange: ({ value }) => {
        const result = connectionSchema.safeParse(value);
        return result.success ? undefined : result.error.flatten().fieldErrors;
      },
    },
    onSubmit: async ({ value }) => {
      setFeedback(null);
      try {
        const parsed = connectionSchema.parse(value);
        await upsertConnection({
          accountId: parsed.accountId || undefined,
          label: parsed.label || undefined,
          queryId: parsed.queryId,
          status: "active",
          tokenExpiresAt: toEndOfUtcDay(parsed.tokenExpiresOn),
          tokenLabel: parsed.tokenLabel || undefined,
        });
        setFeedback({
          message:
            "IBKR connection metadata saved. The worker secret stays outside Trade Tracker.",
          variant: "success",
        });
        setIsEditing(false);
      } catch (error) {
        setFeedback({
          message:
            error instanceof Error
              ? error.message
              : "Could not save the IBKR connection",
          variant: "error",
        });
      }
    },
  });

  useEffect(() => {
    form.reset(connectionFormValues);
  }, [connectionFormValues, form]);

  useEffect(() => {
    if (connectionStatus === "needs_setup") setIsEditing(true);
  }, [connectionStatus]);

  const handleConnectionStatusChange = async () => {
    if (!connection || isChangingStatus) return;
    setFeedback(null);
    setIsChangingStatus(true);
    try {
      if (connection.status === "paused") {
        await upsertConnection({ status: "active" });
        setFeedback({
          message: "Nightly IBKR sync resumed.",
          variant: "success",
        });
      } else {
        await pauseConnection({ connectionId: connection._id });
        setFeedback({
          message: "Nightly IBKR sync paused.",
          variant: "success",
        });
      }
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error
            ? error.message
            : "Could not update the IBKR connection",
        variant: "error",
      });
    } finally {
      setIsChangingStatus(false);
    }
  };

  const statusPresentation = getStatusPresentation(
    connection?.status ?? "needs_setup",
  );
  const latestFailure = status.latestFailedSync;

  return (
    <Card
      className="mb-6 overflow-hidden border-olive-6"
      data-testid={IMPORTS_INDEX_TEST_IDS.brokerageSyncStatus}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-olive-6 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-olive-12">
              IBKR nightly sync
            </h2>
            <Badge variant={statusPresentation.variant}>
              {statusPresentation.label}
            </Badge>
            {connection?.label ? (
              <span className="text-xs text-olive-11">{connection.label}</span>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-olive-11">
            Activity Flex runs at 1:00 a.m. Eastern for the prior business day.
            Synced trades stay in this inbox until accepted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connection && connection.status !== "needs_setup" ? (
            <Button
              dataTestId={
                connection.status === "paused"
                  ? IMPORTS_INDEX_TEST_IDS.brokerageConnectionResumeButton
                  : IMPORTS_INDEX_TEST_IDS.brokerageConnectionPauseButton
              }
              disabled={isChangingStatus}
              isLoading={isChangingStatus}
              onClick={() => void handleConnectionStatusChange()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {connection.status === "paused" ? <Play /> : <Pause />}
              {connection.status === "paused" ? "Resume" : "Pause"}
            </Button>
          ) : null}
          <Button
            dataTestId={
              IMPORTS_INDEX_TEST_IDS.brokerageConnectionConfigureButton
            }
            onClick={() => setIsEditing((current) => !current)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Settings2 />
            {connection ? "Connection" : "Set up connection"}
          </Button>
        </div>
      </div>

      <div className="divide-y divide-olive-6 sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <div
          className="px-4 py-3"
          data-testid={IMPORTS_INDEX_TEST_IDS.brokerageLatestSuccess}
        >
          <p className="text-xs font-medium text-olive-11">Latest success</p>
          <p className="mt-1 text-sm text-olive-12">
            {status.latestSuccessfulSync
              ? `${status.latestSuccessfulSync.reportDate} · ${formatDate(status.latestSuccessfulSync.completedAt ?? status.latestSuccessfulSync.updatedAt)}`
              : "No successful sync yet"}
          </p>
        </div>
        <div
          className="px-4 py-3"
          data-testid={IMPORTS_INDEX_TEST_IDS.brokerageLatestFailure}
        >
          <p className="text-xs font-medium text-olive-11">Latest failure</p>
          <p
            className={cn(
              "mt-1 text-sm",
              latestFailure ? "text-red-11" : "text-olive-12",
            )}
          >
            {latestFailure
              ? (latestFailure.errorMessage ??
                `Failed for ${latestFailure.reportDate}`)
              : "No failures recorded"}
          </p>
        </div>
        <div
          className="px-4 py-3"
          data-testid={IMPORTS_INDEX_TEST_IDS.brokeragePendingImports}
        >
          <p className="text-xs font-medium text-olive-11">
            Pending IBKR trades
          </p>
          <p className="mt-1 text-sm text-olive-12">
            {status.pendingImportedTradeCount === 0
              ? "Inbox is clear"
              : `${status.pendingImportedTradeCount}${status.hasMorePendingImportedTrades ? "+" : ""} awaiting review`}
          </p>
        </div>
        <div
          className="px-4 py-3"
          data-testid={IMPORTS_INDEX_TEST_IDS.brokerageReconciliationIssues}
        >
          <p className="text-xs font-medium text-olive-11">Reconciliation</p>
          {status.openIssueCount === 0 ? (
            <p className="mt-1 text-sm text-olive-12">No open issues</p>
          ) : (
            <button
              aria-controls="brokerage-reconciliation-issue-list"
              aria-expanded={showIssues}
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-amber-11 hover:text-amber-12 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-blue-8 focus-visible:outline-none"
              data-testid={IMPORTS_INDEX_TEST_IDS.brokerageReconciliationToggle}
              onClick={() => setShowIssues((current) => !current)}
              type="button"
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
              {status.openIssueCount}
              {status.hasMoreOpenIssues ? "+" : ""} open
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  showIssues && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      </div>

      {showIssues && status.openIssues.length > 0 ? (
        <div
          className="border-t border-olive-6 bg-slate-2 px-4 py-3"
          id="brokerage-reconciliation-issue-list"
        >
          <h3 className="text-sm font-semibold text-slate-12">
            Open reconciliation issues
          </h3>
          <ul className="mt-2 divide-y divide-slate-6">
            {status.openIssues.map((issue) => (
              <li
                className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                key={issue._id}
              >
                <span className="text-slate-12">{issue.message}</span>
                <span className="shrink-0 text-slate-11">
                  Report {issue.reportDate}
                </span>
              </li>
            ))}
          </ul>
          {status.hasMoreOpenIssues ||
          status.openIssueCount > status.openIssues.length ? (
            <p className="mt-2 text-xs text-slate-11">
              Showing the {status.openIssues.length} most recent issues.
            </p>
          ) : null}
        </div>
      ) : null}

      {feedback ? (
        <div className="border-t border-olive-6 px-4 py-3">
          <Alert variant={feedback.variant} onDismiss={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        </div>
      ) : null}

      {isEditing ? (
        <div
          className="border-t border-olive-6 px-4 py-4"
          data-testid={IMPORTS_INDEX_TEST_IDS.brokerageConnectionForm}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-olive-12">
                Connection metadata
              </h3>
              <p className="mt-1 max-w-3xl text-sm text-olive-11">
                Enter the Client Portal Activity Flex query details. The raw
                Flex token must be installed as{" "}
                <code className="text-olive-12">IBKR_FLEX_TOKEN</code> in the
                Temporal worker secret store; it is never saved here.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <form.AppField
                name="label"
                validators={{
                  onChange: ({ value }) =>
                    validateConnectionField("label", value),
                }}
              >
                {(field) => (
                  <field.FieldInput
                    label="Connection label"
                    placeholder="Main IBKR account"
                  />
                )}
              </form.AppField>
              <form.AppField
                name="accountId"
                validators={{
                  onChange: ({ value }) =>
                    validateConnectionField("accountId", value),
                }}
              >
                {(field) => (
                  <field.FieldInput
                    dataTestId={
                      IMPORTS_INDEX_TEST_IDS.brokerageConnectionAccountIdInput
                    }
                    label="Brokerage account ID"
                    placeholder="U1234567"
                  />
                )}
              </form.AppField>
              <form.AppField
                name="queryId"
                validators={{
                  onChange: ({ value }) =>
                    validateConnectionField("queryId", value),
                }}
              >
                {(field) => (
                  <field.FieldInput
                    dataTestId={
                      IMPORTS_INDEX_TEST_IDS.brokerageConnectionQueryIdInput
                    }
                    inputMode="numeric"
                    label="Activity Flex query ID"
                    placeholder="123456"
                  />
                )}
              </form.AppField>
              <form.AppField
                name="tokenLabel"
                validators={{
                  onChange: ({ value }) =>
                    validateConnectionField("tokenLabel", value),
                }}
              >
                {(field) => (
                  <field.FieldInput
                    label="Worker secret label"
                    placeholder="homelab IBKR token"
                  />
                )}
              </form.AppField>
              <form.AppField
                name="tokenExpiresOn"
                validators={{
                  onChange: ({ value }) =>
                    validateConnectionField("tokenExpiresOn", value),
                }}
              >
                {(field) => (
                  <field.FieldInput label="Token expires" type="date" />
                )}
              </form.AppField>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {connection ? (
                <Button
                  dataTestId={
                    IMPORTS_INDEX_TEST_IDS.brokerageConnectionCancelButton
                  }
                  onClick={() => setIsEditing(false)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
              ) : null}
              <form.AppForm>
                <form.SubmitButton
                  dataTestId={
                    IMPORTS_INDEX_TEST_IDS.brokerageConnectionSaveButton
                  }
                  label="Save and activate"
                  size="sm"
                />
              </form.AppForm>
            </div>
          </form>
        </div>
      ) : null}
    </Card>
  );
}
