"use client";

import { ConvexError } from "convex/values";
import { Preloaded, useMutation, usePreloadedQuery, useQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { MobileHierarchyBreadcrumbs } from "~/components/app-shell/campaign-trade-plan-hierarchy";
import { Alert, Badge, Button, useAppForm } from "~/components/ui";
import NotesSection from "~/components/NotesSection";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { buildHierarchyBreadcrumbs } from "~/lib/campaign-trade-plan-navigation";
import { formatCurrency } from "~/lib/format";

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
  preloadedCampaignNotes,
  preloadedTradePlans,
}: {
  campaignId: Id<"campaigns">;
  preloadedAccountMappings: Preloaded<typeof api.accountMappings.listAccountMappings>;
  preloadedCampaignTrades: Preloaded<typeof api.trades.listTradesByCampaign>;
  preloadedCampaign: Preloaded<typeof api.campaigns.getCampaign>;
  preloadedCampaignNotes: Preloaded<typeof api.notes.getNotesByCampaign>;
  preloadedTradePlans: Preloaded<typeof api.tradePlans.listTradePlansByCampaign>;
}) {
  const accountMappings = usePreloadedQuery(preloadedAccountMappings);
  const campaign = usePreloadedQuery(preloadedCampaign);
  const campaignNotes = usePreloadedQuery(preloadedCampaignNotes);
  const tradePlans = usePreloadedQuery(preloadedTradePlans);
  const trades = usePreloadedQuery(preloadedCampaignTrades);
  const hierarchy = useQuery(api.navigation.getCampaignTradePlanHierarchy, {});

  const addNote = useMutation(api.notes.addNote);
  const updateNote = useMutation(api.notes.updateNote);
  const createTradePlan = useMutation(api.tradePlans.createTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);
  const updateCampaign = useMutation(api.campaigns.updateCampaign);
  const updateCampaignStatus = useMutation(api.campaigns.updateCampaignStatus);

  const tradePlanNameById = useMemo(() => {
    const map = new Map<Id<"tradePlans">, string>();
    for (const tradePlan of tradePlans) {
      map.set(tradePlan._id, tradePlan.name);
    }
    return map;
  }, [tradePlans]);

  const accountNameByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    for (const mapping of accountMappings) {
      map.set(mapping.accountId, mapping.friendlyName);
    }
    return map;
  }, [accountMappings]);

  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [isChangingCampaignStatus, setIsChangingCampaignStatus] = useState(false);

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
  const breadcrumbs =
    hierarchy === undefined
      ? null
      : buildHierarchyBreadcrumbs(hierarchy, {
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
        if (campaignNameSaveState === "saved") {
          setCampaignNameSaveState("idle");
        }
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
        setCampaignNameSaveState("saved");
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

  if (campaign === null) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-slate-11">Campaign not found.</p>
        <Link href="/campaigns" className="mt-4 inline-block text-blue-400 hover:underline">
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
          className="mb-2 inline-block text-sm text-slate-11 hover:text-slate-12 md:hidden"
        >
          &larr; Back to Campaigns
        </Link>
      )}

      <Link
        href="/campaigns"
        className="mb-2 hidden text-sm text-slate-11 hover:text-slate-12 md:inline-block"
      >
        &larr; Back to Campaigns
      </Link>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex-1">
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
              <campaignNameForm.AppForm>
                <campaignNameForm.SubmitButton label="Save Name" />
              </campaignNameForm.AppForm>
            </form>
            {campaignNameError && (
              <Alert variant="error" className="mt-2" onDismiss={() => setCampaignNameError(null)}>
                {campaignNameError}
              </Alert>
            )}
            {campaignNameSaveState === "saving" && (
              <span className="mt-2 flex items-center gap-1 text-sm text-slate-11">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            )}
            {campaignNameSaveState === "saved" && (
              <span className="mt-2 flex items-center gap-1 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
          <div className="w-44">
            <label htmlFor="campaign-status" className="mb-1 block text-xs uppercase tracking-wide text-slate-11">
              Status
            </label>
            <select
              id="campaign-status"
              value={campaign.status}
              disabled={isChangingCampaignStatus}
              onChange={(e) => void handleCampaignStatusChange(e.target.value as CampaignStatus)}
              className="h-9 w-full rounded-md border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-slate-12 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {campaign.status === "closed" && campaign.closedAt && (
          <p className="text-xs text-slate-11">Closed {new Date(campaign.closedAt).toLocaleDateString("en-US")}</p>
        )}

        {statusChangeError && (
          <Alert variant="error" className="mt-3" onDismiss={() => setStatusChangeError(null)}>
            {statusChangeError}
          </Alert>
        )}      </div>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-2 text-lg font-semibold text-slate-12">Thesis</h2>
        {thesisError && (
          <Alert variant="error" className="mb-2" onDismiss={() => setThesisError(null)}>
            {thesisError}
          </Alert>
        )}
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

            {thesisSaveState === "saving" && (
              <span className="flex items-center gap-1 text-sm text-slate-11">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </span>
            )}

            {thesisSaveState === "saved" && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </form>
      </section>

      <NotesSection
        notes={campaignNotes}
        onAddNote={async (content, chartUrls) => {
          await addNote({ campaignId, content, chartUrls });
        }}
        onUpdateNote={async (noteId, content, chartUrls) => {
          await updateNote({ noteId: noteId as Id<"notes">, content, chartUrls });
        }}
      />

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trade Plans</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-11">{tradePlans.length} plans</span>
            <button
              type="button"
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
              onClick={() => {
                setShowCreateTradePlanForm((current) => !current);
                setTradePlanCreateError(null);
              }}
            >
              {showCreateTradePlanForm ? "Hide Form" : "Add Trade Plan"}
            </button>
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

        {tradePlans.length === 0 ? (
          <p className="mb-4 text-sm text-slate-11">No trade plans yet.</p>
        ) : (
          <div className="mb-4 space-y-3">
            {tradePlans.map((plan) => (
              <div key={plan._id} className="rounded border border-slate-600 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/trade-plans/${plan._id}`}
                    className="flex-1 hover:underline"
                  >
                    <p className="font-semibold text-slate-12">{plan.name}</p>
                    <p className="text-sm text-slate-11">{plan.instrumentSymbol}</p>
                  </Link>
                  <div className="flex items-center gap-2">
                    <select
                      value={plan.status}
                      onChange={(e) =>
                        void handleTradePlanStatusChange(
                          plan._id,
                          e.target.value as TradePlanStatus,
                        )
                      }
                      className="h-8 rounded border border-slate-600 bg-slate-700 px-2 text-xs text-slate-12"
                    >
                      <option value="idea">Idea</option>
                      <option value="watching">Watching</option>
                      <option value="active">Active</option>
                      <option value="closed">Closed</option>
                    </select>
                    <Badge variant="neutral">{plan.status}</Badge>
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
              className="grid gap-2 rounded border border-slate-700 p-3"
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
                  <tradePlanForm.SubmitButton label="Save Trade Plan" />
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

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-12">Retrospective</h2>

        {campaign.status !== "closed" ? (
          <p className="text-sm text-slate-11">Retrospective is available after the campaign is closed.</p>
        ) : (
          <>
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
                    label="Retrospective"
                    rows={8}
                    placeholder="What worked, what failed, and what changed your view?"
                  />
                )}
              </retrospectiveForm.AppField>
              <div className="mt-2 flex items-center gap-3">
                <retrospectiveForm.AppForm>
                  <retrospectiveForm.SubmitButton label="Save Retrospective" />
                </retrospectiveForm.AppForm>

                {retrospectiveSaveState === "saving" && (
                  <span className="flex items-center gap-1 text-sm text-slate-11">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                )}

                {retrospectiveSaveState === "saved" && (
                  <span className="flex items-center gap-1 text-sm text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Saved
                  </span>
                )}
              </div>
            </form>
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trades</h2>
          <Link href="/trades/new" className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600">
            Add Trade
          </Link>
        </div>

        {trades.length === 0 ? (
          <p className="text-sm text-slate-11">No trades linked to this campaign yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-11">
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
                  <tr key={trade._id} className="border-b border-slate-700/60">
                    <td className="px-2 py-2 text-slate-11">{new Date(trade.date).toLocaleDateString("en-US")}</td>
                    <td className="px-2 py-2 text-slate-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.brokerageAccountId ? accountNameByAccountId.get(trade.brokerageAccountId) ?? trade.brokerageAccountId : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.tradePlanId ? tradePlanNameById.get(trade.tradePlanId) ?? "\u2014" : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-slate-11">{trade.side}</td>
                    <td className="px-2 py-2 text-slate-11">{trade.quantity}</td>
                    <td className="px-2 py-2 text-slate-11">{formatCurrency(trade.price)}</td>
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
