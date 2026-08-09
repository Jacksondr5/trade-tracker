"use client";

import type { Preloaded } from "convex/react";
import { useAction, useMutation, usePreloadedQuery } from "convex/react";
import {
  AlertTriangle,
  ChevronDown,
  KeyRound,
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
import {
  MAX_IBKR_ACCOUNT_ID_LENGTH,
  MAX_IBKR_EXPECTED_ACCOUNT_IDS,
  MAX_IBKR_FLEX_TOKEN_LENGTH,
} from "../../../../../shared/brokerage/constants";
import { IMPORTS_INDEX_TEST_IDS } from "../../../../../shared/e2e/testIds";

const connectionSchema = z.object({
  expectedAccountIds: z
    .string()
    .refine(
      (value) =>
        parseExpectedAccountIds(value).length <= MAX_IBKR_EXPECTED_ACCOUNT_IDS,
      `Enter ${MAX_IBKR_EXPECTED_ACCOUNT_IDS} expected account IDs or fewer`,
    )
    .refine(
      (value) =>
        parseExpectedAccountIds(value).every(
          (accountId) => accountId.length <= MAX_IBKR_ACCOUNT_ID_LENGTH,
        ),
      `Each account ID must be ${MAX_IBKR_ACCOUNT_ID_LENGTH} characters or less`,
    ),
  label: z.string().trim().max(80, "Label must be 80 characters or less"),
  queryId: z
    .string()
    .trim()
    .min(1, "Flex query ID is required")
    .regex(/^\d+$/, "Flex query ID must contain only numbers"),
  tokenExpiresOn: z
    .string()
    .min(1, "Token expiration date is required")
    .refine(
      (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
      "Enter a valid expiration date",
    ),
  token: z
    .string()
    .trim()
    .max(
      MAX_IBKR_FLEX_TOKEN_LENGTH,
      `Flex token must be ${MAX_IBKR_FLEX_TOKEN_LENGTH} characters or less`,
    ),
});

type ConnectionFormValues = z.infer<typeof connectionSchema>;
type BadgeVariant = NonNullable<BadgeProps["variant"]>;
type ConnectionStatus = "active" | "paused" | "needs_setup" | "error";

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

function toEndOfUtcDay(date: string): number {
  return Date.parse(`${date}T23:59:59.999Z`);
}

function parseExpectedAccountIds(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((accountId) => accountId.trim())
        .filter(Boolean),
    ),
  );
}

function expectedAccountIdsInputValue(accountIds?: string[]): string {
  return accountIds?.join(", ") ?? "";
}

function toOptionalStringPatch(args: {
  cleared: boolean;
  fieldName: string;
  persistedValue: string | undefined;
  value: string;
}) {
  if (args.cleared) return { kind: "clear" as const };
  const value = args.value.trim();
  if (!value) {
    if (args.persistedValue === undefined) return undefined;
    throw new Error(
      `${args.fieldName} cannot be empty; use Clear to remove it`,
    );
  }
  return value === args.persistedValue
    ? undefined
    : { kind: "set" as const, value };
}

function toOptionalStringArrayPatch(args: {
  cleared: boolean;
  fieldName: string;
  persistedValue: string[] | undefined;
  value: string;
}) {
  if (args.cleared) return { kind: "clear" as const };
  const value = parseExpectedAccountIds(args.value);
  if (value.length === 0) {
    if (args.persistedValue === undefined) return undefined;
    throw new Error(
      `${args.fieldName} cannot be empty; use Clear to remove it`,
    );
  }
  return JSON.stringify(value) === JSON.stringify(args.persistedValue)
    ? undefined
    : { kind: "set" as const, value };
}

function validateOptionalMetadataFields(args: {
  cleared: { expectedAccountIds: boolean; label: boolean };
  persisted: {
    expectedAccountIds: string[] | undefined;
    label: string | undefined;
  };
  value: ConnectionFormValues;
}) {
  const result = connectionSchema.safeParse(args.value);
  const fieldErrors = result.success
    ? {}
    : { ...result.error.flatten().fieldErrors };
  if (
    args.persisted.expectedAccountIds !== undefined &&
    !args.cleared.expectedAccountIds &&
    parseExpectedAccountIds(args.value.expectedAccountIds).length === 0
  ) {
    fieldErrors.expectedAccountIds = [
      "Expected account IDs cannot be empty; use Clear to remove them",
    ];
  }
  if (
    args.persisted.label !== undefined &&
    !args.cleared.label &&
    !args.value.label.trim()
  ) {
    fieldErrors.label = ["Label cannot be empty; use Clear to remove it"];
  }
  return Object.keys(fieldErrors).length === 0 ? undefined : fieldErrors;
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
  const [isReplacingToken, setIsReplacingToken] = useState(
    !connection?.tokenConfigured,
  );
  const [showIssues, setShowIssues] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    variant: "error" | "success";
  } | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [clearedMetadata, setClearedMetadata] = useState({
    expectedAccountIds: false,
    label: false,
  });
  const connectionExpectedAccountIds = expectedAccountIdsInputValue(
    connection?.expectedAccountIds,
  );
  const connectionLabel = connection?.label ?? "";
  const connectionQueryId = connection?.queryId ?? "";
  const connectionStatus = connection?.status;
  const connectionTokenExpiresOn = toDateInputValue(connection?.tokenExpiresAt);
  const connectionFormValues = useMemo(
    () => ({
      expectedAccountIds: connectionExpectedAccountIds,
      label: connectionLabel,
      queryId: connectionQueryId,
      token: "",
      tokenExpiresOn: connectionTokenExpiresOn,
    }),
    [
      connectionExpectedAccountIds,
      connectionLabel,
      connectionQueryId,
      connectionTokenExpiresOn,
    ],
  );

  const upsertConnection = useMutation(
    api.brokerageIngestion.upsertIbkrConnection,
  );
  const pauseConnection = useMutation(
    api.brokerageIngestion.pauseBrokerageConnection,
  );
  const setConnectionToken = useAction(
    api.brokerageSecrets.setIbkrConnectionToken,
  );

  const form = useAppForm({
    defaultValues: connectionFormValues satisfies ConnectionFormValues,
    validators: {
      onChange: ({ value }) =>
        validateOptionalMetadataFields({
          cleared: clearedMetadata,
          persisted: {
            expectedAccountIds: connection?.expectedAccountIds,
            label: connection?.label,
          },
          value,
        }),
    },
    onSubmit: async ({ value }) => {
      setFeedback(null);
      try {
        const parsed = connectionSchema.parse(value);
        const token = parsed.token.trim();
        const expectedAccountIds = toOptionalStringArrayPatch({
          cleared: clearedMetadata.expectedAccountIds,
          fieldName: "Expected account IDs",
          persistedValue: connection?.expectedAccountIds,
          value: parsed.expectedAccountIds,
        });
        const label = toOptionalStringPatch({
          cleared: clearedMetadata.label,
          fieldName: "Label",
          persistedValue: connection?.label,
          value: parsed.label,
        });
        const tokenExpiresAt = toEndOfUtcDay(parsed.tokenExpiresOn);
        if ((!connection?.tokenConfigured || isReplacingToken) && !token) {
          throw new Error("IBKR Flex token is required");
        }
        let connectionId = connection?._id;
        if (!connectionId) {
          connectionId = await upsertConnection({
            queryId: parsed.queryId,
            status: "needs_setup",
          });
        }
        if (token) {
          await setConnectionToken({
            connectionId,
            metadata: {
              expectedAccountIds,
              label,
              queryId: parsed.queryId,
              tokenExpiresAt,
            },
            token,
          });
        } else {
          await upsertConnection({
            expectedAccountIds,
            label,
            queryId: parsed.queryId,
            status: connection?.status === "paused" ? "paused" : "active",
            tokenExpiresAt,
          });
        }
        setFeedback({
          message: token
            ? "IBKR connection saved with its encrypted Flex credential."
            : "IBKR connection metadata saved.",
          variant: "success",
        });
        form.reset({ ...parsed, token: "" });
        setClearedMetadata({ expectedAccountIds: false, label: false });
        setIsReplacingToken(false);
        setIsEditing(false);
      } catch (error) {
        form.setFieldValue("token", "");
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
    setClearedMetadata({ expectedAccountIds: false, label: false });
  }, [connectionFormValues, form]);

  useEffect(() => {
    if (connectionStatus === "needs_setup") {
      setIsEditing(true);
      setIsReplacingToken(true);
    }
  }, [connectionStatus]);

  const handleEditingToggle = () => {
    form.reset(connectionFormValues);
    setClearedMetadata({ expectedAccountIds: false, label: false });
    setIsReplacingToken(!connection?.tokenConfigured);
    setIsEditing((current) => !current);
  };

  const handleMetadataClearToggle = (field: "expectedAccountIds" | "label") => {
    const persistedValue =
      field === "expectedAccountIds"
        ? connection?.expectedAccountIds
          ? expectedAccountIdsInputValue(connection.expectedAccountIds)
          : undefined
        : connection?.label;
    if (persistedValue === undefined) return;
    if (!clearedMetadata[field]) {
      form.setFieldValue(field, persistedValue);
    }
    setClearedMetadata((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

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
            onClick={handleEditingToggle}
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
                Enter the Client Portal Activity Flex query details and a token
                for this connection. The token is encrypted before storage and
                is never shown again.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <form.AppField name="label">
                  {(field) => (
                    <field.FieldInput
                      dataTestId={
                        IMPORTS_INDEX_TEST_IDS.brokerageConnectionLabelInput
                      }
                      disabled={clearedMetadata.label}
                      displayValue={clearedMetadata.label ? "" : undefined}
                      label="Connection label"
                      labelAction={
                        connection?.label ? (
                          <Button
                            className="h-auto px-0 py-0"
                            dataTestId={
                              clearedMetadata.label
                                ? IMPORTS_INDEX_TEST_IDS.brokerageConnectionLabelUndoButton
                                : IMPORTS_INDEX_TEST_IDS.brokerageConnectionLabelClearButton
                            }
                            onClick={() => handleMetadataClearToggle("label")}
                            size="sm"
                            type="button"
                            variant="link"
                          >
                            {clearedMetadata.label ? "Undo" : "Clear"}
                          </Button>
                        ) : undefined
                      }
                      placeholder="Main IBKR account"
                    />
                  )}
                </form.AppField>
                {clearedMetadata.label ? (
                  <p className="mt-1.5 text-xs text-olive-11">
                    Label will be cleared when saved.
                  </p>
                ) : null}
              </div>
              <div>
                <form.AppField name="expectedAccountIds">
                  {(field) => (
                    <field.FieldTextarea
                      dataTestId={
                        IMPORTS_INDEX_TEST_IDS.brokerageConnectionExpectedAccountIdsTextarea
                      }
                      disabled={clearedMetadata.expectedAccountIds}
                      displayValue={
                        clearedMetadata.expectedAccountIds ? "" : undefined
                      }
                      label="Expected account IDs"
                      labelAction={
                        connection?.expectedAccountIds?.length ? (
                          <Button
                            className="h-auto px-0 py-0"
                            dataTestId={
                              clearedMetadata.expectedAccountIds
                                ? IMPORTS_INDEX_TEST_IDS.brokerageConnectionExpectedAccountIdsUndoButton
                                : IMPORTS_INDEX_TEST_IDS.brokerageConnectionExpectedAccountIdsClearButton
                            }
                            onClick={() =>
                              handleMetadataClearToggle("expectedAccountIds")
                            }
                            size="sm"
                            type="button"
                            variant="link"
                          >
                            {clearedMetadata.expectedAccountIds
                              ? "Undo"
                              : "Clear"}
                          </Button>
                        ) : undefined
                      }
                      placeholder={
                        "U1234567, U7654321\nor one account per line"
                      }
                      resize="vertical"
                      rows={2}
                    />
                  )}
                </form.AppField>
                {clearedMetadata.expectedAccountIds ? (
                  <p className="mt-1.5 text-xs text-olive-11">
                    Expected account IDs will be cleared when saved.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-olive-11">
                    Separate with commas or new lines. A sync fails before
                    ingestion if any are absent from the report.
                  </p>
                )}
              </div>
              <form.AppField name="queryId">
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
              <form.AppField name="tokenExpiresOn">
                {(field) => (
                  <field.FieldInput
                    dataTestId={
                      IMPORTS_INDEX_TEST_IDS.brokerageConnectionTokenExpiryInput
                    }
                    label="Token expires"
                    type="date"
                  />
                )}
              </form.AppField>
            </div>
            <div
              className="mt-4 rounded-md border border-olive-6 bg-olive-2 p-3"
              data-testid={
                IMPORTS_INDEX_TEST_IDS.brokerageConnectionTokenStatus
              }
            >
              {connection?.tokenConfigured && !isReplacingToken ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="inline-flex items-center gap-2 text-sm text-olive-12">
                    <KeyRound className="size-4" aria-hidden="true" />
                    Configured
                    {connection.tokenExpiresAt
                      ? ` · expires ${new Date(
                          connection.tokenExpiresAt,
                        ).toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                          year: "numeric",
                        })}`
                      : ""}
                  </p>
                  <Button
                    dataTestId={
                      IMPORTS_INDEX_TEST_IDS.brokerageConnectionReplaceTokenButton
                    }
                    onClick={() => setIsReplacingToken(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Replace token
                  </Button>
                </div>
              ) : (
                <form.AppField name="token">
                  {(field) => (
                    <field.FieldInput
                      autoComplete="new-password"
                      dataTestId={
                        IMPORTS_INDEX_TEST_IDS.brokerageConnectionTokenInput
                      }
                      label={
                        connection?.tokenConfigured
                          ? "Replacement Flex token"
                          : "Flex token"
                      }
                      placeholder="Paste token"
                      type="password"
                    />
                  )}
                </form.AppField>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {connection ? (
                <Button
                  dataTestId={
                    IMPORTS_INDEX_TEST_IDS.brokerageConnectionCancelButton
                  }
                  onClick={handleEditingToggle}
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
