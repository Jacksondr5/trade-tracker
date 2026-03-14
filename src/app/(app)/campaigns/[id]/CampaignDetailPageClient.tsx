"use client";

import { ConvexError } from "convex/values";
import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import { CheckCircle2, Loader2, Pencil, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  MobileHierarchyBreadcrumbs,
} from "~/components/app-shell/campaign-trade-plan-hierarchy";
import { useNavigationData } from "~/components/app-shell";
import { Alert, Badge, type BadgeProps, Button, useAppForm } from "~/components/ui";
import NotesSection from "~/components/NotesSection";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { buildHierarchyBreadcrumbs } from "~/lib/campaign-trade-plan-navigation";
import { capitalize, formatCurrency, formatDate } from "~/lib/format";
import { cn } from "~/lib/utils";

type CampaignStatus = "planning" | "active" | "closed";
type TradePlanStatus = "idea" | "watching" | "active" | "closed";
type SaveState = "idle" | "saving" | "saved";

const tradePlanSchema = z.object({
  instrumentSymbol: z.string().trim().min(1, "Instrument symbol is required"),
  name: z.string().trim().min(1, "Trade plan name is required"),
});
const campaignNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Campaign name is required")
    .max(120, "Campaign name must be 120 characters or less"),
});
const thesisSchema = z.object({
  thesis: z.string().trim().min(1, "Thesis is required"),
});
const retrospectiveSchema = z.object({
  retrospective: z.string(),
});

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

function getStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "planning":
    case "idea":
      return "info";
    case "watching":
      return "warning";
    case "active":
      return "success";
    default:
      return "neutral";
  }
}

function WatchlistIndicator({
  label,
}: {
  label: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full border border-amber-8/70 bg-amber-3/30 px-2 py-1 text-xs font-medium text-amber-11"
    >
      <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

const validateWithSchema = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    return result.error.flatten().fieldErrors;
  }
  return undefined;
};

export default function CampaignDetailPageClient({
  campaignId,
  preloadedAccountMappings,
  preloadedCampaignTrades,
  preloadedCampaign,
  preloadedCampaignWorkspace,
  preloadedCampaignNotes,
}: {
  campaignId: Id<"campaigns">;
  preloadedAccountMappings: Preloaded<typeof api.accountMappings.listAccountMappings>;
  preloadedCampaignTrades: Preloaded<typeof api.trades.listTradesByCampaign>;
  preloadedCampaign: Preloaded<typeof api.campaigns.getCampaign>;
  preloadedCampaignWorkspace: Preloaded<typeof api.campaigns.getCampaignWorkspace>;
  preloadedCampaignNotes: Preloaded<typeof api.notes.getNotesByCampaign>;
}) {
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const campaign = usePreloadedQuery(preloadedCampaign);
  const campaignWorkspace = usePreloadedQuery(preloadedCampaignWorkspace);
  const campaignNotes = usePreloadedQuery(preloadedCampaignNotes);
  const trades = usePreloadedQuery(preloadedCampaignTrades);
  const { hierarchy } = useNavigationData();
  const linkedTradePlans = useMemo(
    () => campaignWorkspace?.linkedTradePlans ?? [],
    [campaignWorkspace],
  );
  const workspaceSummary = campaignWorkspace?.summary ?? null;

  const addNote = useMutation(api.notes.addNote);
  const updateNote = useMutation(api.notes.updateNote);
  const createTradePlan = useMutation(api.tradePlans.createTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);
  const updateCampaign = useMutation(api.campaigns.updateCampaign);
  const updateCampaignStatus = useMutation(api.campaigns.updateCampaignStatus);
  const watchItem = useMutation(api.watchlist.watchItem);
  const unwatchItem = useMutation(api.watchlist.unwatchItem);

  const tradePlanNameById = useMemo(() => {
    const map = new Map<Id<"tradePlans">, string>();
    for (const tradePlan of linkedTradePlans) {
      map.set(tradePlan.id, tradePlan.name);
    }
    return map;
  }, [linkedTradePlans]);

  const accountNameByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    for (const mapping of accountMappings) {
      map.set(mapping.accountId, mapping.friendlyName);
    }
    return map;
  }, [accountMappings]);

  const executionStats = useMemo(() => {
    if (trades.length === 0) return null;
    const uniqueInstruments = new Set(trades.map((t) => t.ticker));
    const dates = trades.map((t) => t.date).sort((a, b) => a - b);
    return {
      totalCount: trades.length,
      uniqueInstruments: uniqueInstruments.size,
      earliestDate: dates[0]!,
      latestDate: dates[dates.length - 1]!,
    };
  }, [trades]);

  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [isChangingCampaignStatus, setIsChangingCampaignStatus] = useState(false);
  const [isWatchPending, setIsWatchPending] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingThesis, setIsEditingThesis] = useState(false);

  const [campaignNameInitialized, setCampaignNameInitialized] = useState(false);
  const [campaignNameError, setCampaignNameError] = useState<string | null>(null);
  const [campaignNameSaveState, setCampaignNameSaveState] = useState<SaveState>("idle");

  const [thesisInitialized, setThesisInitialized] = useState(false);
  const [thesisError, setThesisError] = useState<string | null>(null);
  const [thesisSaveState, setThesisSaveState] = useState<SaveState>("idle");

  const [retrospectiveInitialized, setRetrospectiveInitialized] = useState(false);
  const [retrospectiveError, setRetrospectiveError] = useState<string | null>(null);
  const [retrospectiveSaveState, setRetrospectiveSaveState] = useState<SaveState>("idle");

  const [tradePlanCreateError, setTradePlanCreateError] = useState<string | null>(null);
  const [tradePlanStatusError, setTradePlanStatusError] = useState<string | null>(null);
  const [showCreateTradePlanForm, setShowCreateTradePlanForm] = useState(false);
  const breadcrumbs = buildHierarchyBreadcrumbs(hierarchy, {
    campaignId,
    kind: "campaign",
  });

  const campaignNameForm = useAppForm({
    defaultValues: {
      name: "",
    },
    validators: {
      onChange: ({ value }) => {
        setCampaignNameError(null);
        return validateWithSchema(campaignNameSchema, value);
      },
    },
    onSubmit: async ({ value }) => {
      setCampaignNameError(null);
      setCampaignNameSaveState("saving");

      try {
        const parsed = campaignNameSchema.parse(value);
        await updateCampaign({
          campaignId,
          name: parsed.name,
        });
        campaignNameForm.setFieldValue("name", parsed.name);
        setCampaignNameSaveState("idle");
        setIsEditingName(false);
      } catch (error) {
        setCampaignNameError(
          error instanceof ConvexError
            ? typeof error.data === "string"
              ? error.data
              : "Failed to save campaign name"
            : error instanceof Error
              ? error.message
              : "Failed to save campaign name",
        );
        setCampaignNameSaveState("idle");
      }
    },
  });

  const thesisForm = useAppForm({
    defaultValues: {
      thesis: "",
    },
    validators: {
      onChange: ({ value }) => {
        setThesisError(null);
        if (thesisSaveState === "saved") {
          setThesisSaveState("idle");
        }
        return validateWithSchema(thesisSchema, value);
      },
    },
    onSubmit: async ({ value }) => {
      setThesisError(null);
      setThesisSaveState("saving");

      try {
        const parsed = thesisSchema.parse(value);
        await updateCampaign({
          campaignId,
          thesis: parsed.thesis,
        });
        thesisForm.setFieldValue("thesis", parsed.thesis);
        setThesisSaveState("saved");
        setIsEditingThesis(false);
      } catch (error) {
        setThesisError(error instanceof Error ? error.message : "Failed to save thesis");
        setThesisSaveState("idle");
      }
    },
  });

  const retrospectiveForm = useAppForm({
    defaultValues: {
      retrospective: "",
    },
    validators: {
      onChange: ({ value }) => {
        setRetrospectiveError(null);
        if (retrospectiveSaveState === "saved") {
          setRetrospectiveSaveState("idle");
        }
        return validateWithSchema(retrospectiveSchema, value);
      },
    },
    onSubmit: async ({ value }) => {
      setRetrospectiveError(null);
      setRetrospectiveSaveState("saving");

      try {
        const parsed = retrospectiveSchema.parse(value);
        const trimmedRetrospective = parsed.retrospective.trim();
        await updateCampaign({
          campaignId,
          retrospective: trimmedRetrospective,
        });
        retrospectiveForm.setFieldValue("retrospective", trimmedRetrospective);
        setRetrospectiveSaveState("saved");
      } catch (error) {
        setRetrospectiveError(
          error instanceof Error ? error.message : "Failed to save retrospective",
        );
        setRetrospectiveSaveState("idle");
      }
    },
  });

  const tradePlanForm = useAppForm({
    defaultValues: {
      instrumentSymbol: "",
      name: "",
    },
    validators: {
      onChange: ({ value }) => {
        setTradePlanCreateError(null);
        return validateWithSchema(tradePlanSchema, value);
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setTradePlanCreateError(null);
      try {
        const parsed = tradePlanSchema.parse(value);
        await createTradePlan({
          campaignId,
          instrumentSymbol: parsed.instrumentSymbol.toUpperCase(),
          name: parsed.name,
        });

        formApi.reset();
        setShowCreateTradePlanForm(false);
      } catch (error) {
        setTradePlanCreateError(
          error instanceof Error ? error.message : "Failed to create trade plan",
        );
      }
    },
  });

  useEffect(() => {
    if (campaign && !campaignNameInitialized) {
      campaignNameForm.setFieldValue("name", campaign.name);
      setCampaignNameInitialized(true);
    }
  }, [campaign, campaignNameForm, campaignNameInitialized]);

  useEffect(() => {
    if (campaign && !thesisInitialized) {
      thesisForm.setFieldValue("thesis", campaign.thesis);
      setThesisInitialized(true);
    }
  }, [campaign, thesisForm, thesisInitialized]);

  useEffect(() => {
    if (campaign && !retrospectiveInitialized) {
      retrospectiveForm.setFieldValue("retrospective", campaign.retrospective || "");
      setRetrospectiveInitialized(true);
    }
  }, [campaign, retrospectiveForm, retrospectiveInitialized]);

  const handleCampaignStatusChange = async (status: CampaignStatus) => {
    setStatusChangeError(null);
    setIsChangingCampaignStatus(true);

    try {
      await updateCampaignStatus({ campaignId, status });
    } catch (error) {
      setStatusChangeError(
        error instanceof Error ? error.message : "Failed to update campaign status",
      );
    } finally {
      setIsChangingCampaignStatus(false);
    }
  };

  const handleTradePlanStatusChange = async (
    tradePlanId: Id<"tradePlans">,
    status: TradePlanStatus,
  ) => {
    setTradePlanStatusError(null);
    try {
      await updateTradePlanStatus({ tradePlanId, status });
    } catch (error) {
      setTradePlanStatusError(
        error instanceof Error ? error.message : "Failed to update trade plan status",
      );
    }
  };

  const handleToggleWatch = async () => {
    setWatchError(null);
    setIsWatchPending(true);
    try {
      const payload = { item: { itemType: "campaign" as const, campaignId } };
      if (workspaceSummary?.isWatched) {
        await unwatchItem(payload);
      } else {
        await watchItem(payload);
      }
    } catch (error) {
      setWatchError(error instanceof Error ? error.message : "Failed to update Watchlist state.");
    } finally {
      setIsWatchPending(false);
    }
  };

  if (campaign === null || campaignWorkspace === null || workspaceSummary === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-olive-11">Campaign not found.</p>
        <Link href="/campaigns" className="mt-4 inline-block text-blue-9 hover:underline">
          Back to campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {breadcrumbs !== null ? (
        <MobileHierarchyBreadcrumbs breadcrumbs={breadcrumbs} />
      ) : (
        <Link
          href="/campaigns"
          className="mb-2 inline-block text-sm text-olive-11 hover:text-olive-12 md:hidden"
        >
          &larr; Back to Campaigns
        </Link>
      )}

      <Link
        href="/campaigns"
        className="mb-2 hidden text-sm text-olive-11 hover:text-olive-12 md:inline-block"
      >
        &larr; Back to Campaigns
      </Link>

      {campaign.status === "closed" && (
        <div className="mb-4 rounded-lg border border-olive-6 bg-olive-3 p-3 text-sm text-olive-11">
          This campaign was closed on {campaign.closedAt ? formatDate(campaign.closedAt) : "an unknown date"}.
          {!workspaceSummary.lifecycle.hasRetrospective && " No retrospective has been written yet."}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        {/* Title row: name + status badge + status select + watch toggle */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <div className="space-y-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void campaignNameForm.handleSubmit();
                  }}
                  className="space-y-2"
                >
                  <campaignNameForm.AppField name="name">
                    {(field) => (
                      <field.FieldInput
                        label="Campaign Name"
                        maxLength={120}
                        className="w-full"
                      />
                    )}
                  </campaignNameForm.AppField>
                  <div className="flex items-center gap-2">
                    <campaignNameForm.AppForm>
                      <campaignNameForm.SubmitButton label="Save Name" />
                    </campaignNameForm.AppForm>
                    <campaignNameForm.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <Button
                          dataTestId="cancel-edit-campaign-name"
                          type="button"
                          variant="outline"
                          disabled={isSubmitting}
                          onClick={() => {
                            setIsEditingName(false);
                            campaignNameForm.setFieldValue("name", campaign.name);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </campaignNameForm.Subscribe>
                  </div>
                </form>
                {campaignNameError && (
                  <Alert variant="error" className="mt-2" onDismiss={() => setCampaignNameError(null)}>
                    {campaignNameError}
                  </Alert>
                )}
                {campaignNameSaveState === "saving" && (
                  <span className="mt-2 flex items-center gap-1 text-sm text-olive-11">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-olive-12 md:text-3xl">{campaign.name}</h1>
                <Button
                  dataTestId="edit-campaign-name"
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Edit campaign name"
                  onClick={() => setIsEditingName(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="w-36">
              <label htmlFor="campaign-status" className="mb-1 block text-xs uppercase tracking-wide text-olive-11">
                Status
              </label>
              <select
                id="campaign-status"
                value={campaign.status}
                disabled={isChangingCampaignStatus}
                onChange={(e) => void handleCampaignStatusChange(e.target.value as CampaignStatus)}
                className="h-9 w-full rounded-md border border-olive-6 bg-olive-3 px-3 py-1 text-sm text-olive-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
              {campaign.status === "closed" && workspaceSummary.linkedTradePlans.openCount > 0 && (
                <p className="mt-1 text-xs text-amber-11">
                  This campaign has {workspaceSummary.linkedTradePlans.openCount} open trade plan{workspaceSummary.linkedTradePlans.openCount !== 1 ? "s" : ""}. They can be closed independently but cannot be reopened while the campaign remains closed.
                </p>
              )}
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              dataTestId="toggle-watch-campaign"
              aria-label={
                workspaceSummary.isWatched
                  ? `Remove ${campaign.name} from Watchlist`
                  : `Add ${campaign.name} to Watchlist`
              }
              className={cn(
                "mt-4 h-8 w-8 rounded-md text-olive-10 hover:bg-olive-4 hover:text-olive-12",
                workspaceSummary.isWatched && "text-amber-11 hover:text-amber-12",
              )}
              aria-pressed={workspaceSummary.isWatched}
              disabled={isWatchPending}
              onClick={() => void handleToggleWatch()}
            >
              <Star className={cn("h-4 w-4", workspaceSummary.isWatched && "fill-current")} />
            </Button>
          </div>
        </div>

        {/* Rollup stats row */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-olive-10">
          <span>{workspaceSummary.linkedTradePlans.totalCount} trade plans</span>
          <span className="text-olive-6">&middot;</span>
          <span>{workspaceSummary.linkedTrades.totalCount} trades</span>
          {campaign.status === "closed" && campaign.closedAt && (
            <>
              <span className="text-olive-6">&middot;</span>
              <span>Closed {formatDate(campaign.closedAt)}</span>
            </>
          )}
        </div>

        {statusChangeError && (
          <Alert variant="error" className="mt-3" onDismiss={() => setStatusChangeError(null)}>
            {statusChangeError}
          </Alert>
        )}
        {watchError && (
          <Alert variant="error" className="mt-3" onDismiss={() => setWatchError(null)}>
            {watchError}
          </Alert>
        )}
      </div>

      <section className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-olive-12">Thesis</h2>
          {!isEditingThesis && (
            <Button
              dataTestId="edit-thesis"
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit thesis"
              onClick={() => setIsEditingThesis(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
        {thesisError && (
          <Alert variant="error" className="mb-2" onDismiss={() => setThesisError(null)}>
            {thesisError}
          </Alert>
        )}
        {isEditingThesis ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void thesisForm.handleSubmit();
            }}
          >
            <thesisForm.AppField name="thesis">
              {(field) => (
                <field.FieldTextarea
                  label="Thesis"
                  rows={6}
                />
              )}
            </thesisForm.AppField>
            <div className="mt-2 flex items-center gap-3">
              <thesisForm.AppForm>
                <thesisForm.SubmitButton label="Save Thesis" />
              </thesisForm.AppForm>
              <thesisForm.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    dataTestId="cancel-edit-thesis"
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => {
                      setIsEditingThesis(false);
                      thesisForm.setFieldValue("thesis", campaign.thesis);
                      setThesisError(null);
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </thesisForm.Subscribe>

              {thesisSaveState === "saving" && (
                <span className="flex items-center gap-1 text-sm text-olive-11">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              )}

              {thesisSaveState === "saved" && (
                <span className="flex items-center gap-1 text-sm text-grass-9">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </form>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-olive-11">
            {campaign.thesis || "No thesis written yet."}
          </p>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <h2 className="mb-2 text-lg font-semibold text-olive-12">Campaign Notes</h2>
        <NotesSection
          notes={campaignNotes}
          onAddNote={async (content, chartUrls) => {
            await addNote({ campaignId, content, chartUrls });
          }}
          onUpdateNote={async (noteId, content, chartUrls) => {
            await updateNote({ noteId: noteId as Id<"notes">, content, chartUrls });
          }}
        />
      </section>

      <section className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-olive-12">Linked Trade Plans</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-olive-11">
              {workspaceSummary.linkedTradePlans.totalCount} plans
            </span>
            <Button
              dataTestId="add-trade-plan-button"
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateTradePlanForm((current) => !current);
                setTradePlanCreateError(null);
              }}
            >
              {showCreateTradePlanForm ? "Hide Form" : "Link trade plan"}
            </Button>
          </div>
        </div>

        {tradePlanStatusError && (
          <Alert
            variant="error"
            className="mb-3"
            onDismiss={() => setTradePlanStatusError(null)}
          >
            {tradePlanStatusError}
          </Alert>
        )}

        {linkedTradePlans.length === 0 ? (
          <p className="mb-4 text-sm text-olive-11">
            No linked trade plans. Add a trade plan to start expressing this campaign&apos;s thesis.
          </p>
        ) : (
          <div className="mb-4 space-y-3">
            {linkedTradePlans.map((plan) => (
              <div key={plan.id} className="rounded border border-olive-6 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/trade-plans/${plan.id}`}
                    className="min-w-0 flex-1 hover:underline"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-olive-12">{plan.name}</span>
                      <Badge variant={getStatusVariant(plan.status)}>
                        {capitalize(plan.status)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm">
                      <span className="font-medium text-olive-12">{plan.instrumentSymbol}</span>
                      <span className="text-olive-11">
                        {" \u00b7 "}
                        {plan.tradeCount > 0
                          ? `${plan.tradeCount} trade${plan.tradeCount !== 1 ? "s" : ""}`
                          : "No trades yet"}
                      </span>
                      {plan.closedAt !== null && (
                        <span className="text-olive-10">
                          {" \u00b7 Closed "}
                          {formatDate(plan.closedAt)}
                        </span>
                      )}
                      {plan.invalidatedAt !== null && (
                        <span className="text-amber-11">
                          {" \u00b7 Invalidated"}
                        </span>
                      )}
                    </p>
                  </Link>
                  <div className="flex items-center gap-2">
                    {plan.isWatched ? <WatchlistIndicator label="Watched" /> : null}
                    <select
                      value={plan.status}
                      onChange={(e) =>
                        void handleTradePlanStatusChange(
                          plan.id,
                          e.target.value as TradePlanStatus,
                        )
                      }
                      className="h-8 rounded border border-olive-6 bg-olive-3 px-2 text-xs text-olive-12"
                    >
                      <option value="idea">Idea</option>
                      <option value="watching">Watching</option>
                      <option value="active">Active</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {showCreateTradePlanForm && (
          <>
            {tradePlanCreateError && (
              <Alert
                variant="error"
                className="mb-2"
                onDismiss={() => setTradePlanCreateError(null)}
              >
                {tradePlanCreateError}
              </Alert>
            )}
            <form
              className="grid gap-2 rounded border border-olive-6 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void tradePlanForm.handleSubmit();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <tradePlanForm.AppField name="name">
                  {(field) => (
                    <field.FieldInput
                      label="Trade plan name"
                      placeholder="Trade plan name"
                    />
                  )}
                </tradePlanForm.AppField>
                <tradePlanForm.AppField name="instrumentSymbol">
                  {(field) => (
                    <field.FieldInput
                      label="Instrument symbol"
                      placeholder="Instrument symbol"
                    />
                  )}
                </tradePlanForm.AppField>
              </div>
              <div className="flex items-center gap-2">
                <tradePlanForm.AppForm>
                  <tradePlanForm.SubmitButton label="Create trade plan" />
                </tradePlanForm.AppForm>
                <tradePlanForm.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <Button
                      dataTestId="cancel-trade-plan-form-button"
                      type="button"
                      variant="outline"
                      onClick={() => { setShowCreateTradePlanForm(false); setTradePlanCreateError(null); }}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                  )}
                </tradePlanForm.Subscribe>
              </div>
            </form>
          </>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <h2 className="mb-3 text-lg font-semibold text-olive-12">Campaign Review</h2>

        {campaign.status !== "closed" ? (
          <p className="text-sm text-olive-11">Campaign review becomes available when the campaign is closed.</p>
        ) : (
          <>
            {!campaign.retrospective?.trim() && (
              <p className="mb-3 text-sm text-olive-10">Capture what you learned while it&apos;s fresh.</p>
            )}
            {retrospectiveError && (
              <Alert
                variant="error"
                className="mb-2"
                onDismiss={() => setRetrospectiveError(null)}
              >
                {retrospectiveError}
              </Alert>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void retrospectiveForm.handleSubmit();
              }}
            >
              <retrospectiveForm.AppField name="retrospective">
                {(field) => (
                  <field.FieldTextarea
                    label="Campaign Review"
                    rows={8}
                    placeholder="What worked, what didn't, and what would you do differently?"
                  />
                )}
              </retrospectiveForm.AppField>
              <div className="mt-2 flex items-center gap-3">
                <retrospectiveForm.AppForm>
                  <retrospectiveForm.SubmitButton label="Save review" />
                </retrospectiveForm.AppForm>

                {retrospectiveSaveState === "saving" && (
                  <span className="flex items-center gap-1 text-sm text-olive-11">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                )}

                {retrospectiveSaveState === "saved" && (
                  <span className="flex items-center gap-1 text-sm text-grass-9">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
              </div>
            </form>
          </>
        )}
      </section>

      <section className="rounded-lg border border-olive-6 bg-olive-2 p-4">
        <h2 className="mb-3 text-lg font-semibold text-olive-12">Execution</h2>

        {executionStats && (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-olive-11">
            <span>{executionStats.totalCount} trade{executionStats.totalCount !== 1 ? "s" : ""}</span>
            <span className="text-olive-6">&middot;</span>
            <span>{executionStats.uniqueInstruments} instrument{executionStats.uniqueInstruments !== 1 ? "s" : ""}</span>
            <span className="text-olive-6">&middot;</span>
            <span>
              {formatDate(executionStats.earliestDate)} &mdash; {formatDate(executionStats.latestDate)}
            </span>
          </div>
        )}

        {trades.length === 0 ? (
          <p className="text-sm text-olive-11">
            No trades recorded yet. Trades appear here as they are linked through this campaign&apos;s trade plans.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-olive-6 text-left text-olive-11">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Ticker</th>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2">Trade Plan</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade._id} className="border-b border-olive-6/60">
                    <td className="px-2 py-2 text-olive-11">{new Date(trade.date).toLocaleDateString("en-US")}</td>
                    <td className="px-2 py-2 text-olive-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-olive-11">
                      {trade.brokerageAccountId ? accountNameByAccountId.get(trade.brokerageAccountId) ?? trade.brokerageAccountId : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-olive-11">
                      {trade.tradePlanId ? (
                        <Link
                          href={`/trade-plans/${trade.tradePlanId}`}
                          className="text-blue-9 hover:underline"
                        >
                          {tradePlanNameById.get(trade.tradePlanId) ?? "\u2014"}
                        </Link>
                      ) : (
                        "\u2014"
                      )}
                    </td>
                    <td className="px-2 py-2 text-olive-11">{trade.side}</td>
                    <td className="px-2 py-2 text-olive-11">{trade.quantity}</td>
                    <td className="px-2 py-2 text-olive-11">{formatCurrency(trade.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
