"use client";

import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useAppForm } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Doc, Id } from "~/convex/_generated/dataModel";

type CampaignStatus = "planning" | "active" | "closed";
type TradePlanStatus = "idea" | "watching" | "active" | "closed";
type SaveState = "idle" | "saving" | "saved";
const noteSchema = z.object({
  content: z.string().min(1, "Note content is required"),
});

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as Id<"campaigns">;

  const campaign = useQuery(api.campaigns.getCampaign, { campaignId });
  const campaignNotes = useQuery(api.campaignNotes.getNotesByCampaign, { campaignId });
  const tradePlans = useQuery(api.tradePlans.listTradePlansByCampaign, { campaignId });
  const allTrades = useQuery(api.trades.listTrades);
  const campaignPL = useQuery(api.campaigns.getCampaignPL, { campaignId });

  const addNote = useMutation(api.campaignNotes.addNote);
  const updateNote = useMutation(api.campaignNotes.updateNote);
  const createTradePlan = useMutation(api.tradePlans.createTradePlan);
  const updateTradePlan = useMutation(api.tradePlans.updateTradePlan);
  const updateTradePlanStatus = useMutation(api.tradePlans.updateTradePlanStatus);
  const updateCampaign = useMutation(api.campaigns.updateCampaign);
  const updateCampaignStatus = useMutation(api.campaigns.updateCampaignStatus);

  const trades = useMemo(() => {
    if (!tradePlans || !allTrades) {
      return undefined;
    }

    const tradePlanIds = new Set(tradePlans.map((plan) => plan._id));
    return allTrades.filter((trade) => trade.tradePlanId && tradePlanIds.has(trade.tradePlanId));
  }, [allTrades, tradePlans]);

  const tradePlanNameById = useMemo(() => {
    const map = new Map<Id<"tradePlans">, string>();
    if (!tradePlans) {
      return map;
    }

    for (const tradePlan of tradePlans) {
      map.set(tradePlan._id, tradePlan.name);
    }
    return map;
  }, [tradePlans]);

  const [statusChangeError, setStatusChangeError] = useState<string | null>(null);
  const [isChangingCampaignStatus, setIsChangingCampaignStatus] = useState(false);

  const [thesis, setThesis] = useState("");
  const [thesisInitialized, setThesisInitialized] = useState(false);
  const [thesisError, setThesisError] = useState<string | null>(null);
  const [thesisSaveState, setThesisSaveState] = useState<SaveState>("idle");

  const [noteError, setNoteError] = useState<string | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<Id<"campaignNotes"> | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const [retrospective, setRetrospective] = useState("");
  const [retrospectiveInitialized, setRetrospectiveInitialized] = useState(false);
  const [retrospectiveError, setRetrospectiveError] = useState<string | null>(null);
  const [retrospectiveSaveState, setRetrospectiveSaveState] = useState<SaveState>("idle");

  const [planName, setPlanName] = useState("");
  const [planInstrumentSymbol, setPlanInstrumentSymbol] = useState("");
  const [planEntryConditions, setPlanEntryConditions] = useState("");
  const [planExitConditions, setPlanExitConditions] = useState("");
  const [planTargetConditions, setPlanTargetConditions] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [showCreateTradePlanForm, setShowCreateTradePlanForm] = useState(false);

  const [editingPlanId, setEditingPlanId] = useState<Id<"tradePlans"> | null>(null);
  const [editingPlanName, setEditingPlanName] = useState("");
  const [editingPlanInstrumentSymbol, setEditingPlanInstrumentSymbol] = useState("");
  const [editingPlanEntryConditions, setEditingPlanEntryConditions] = useState("");
  const [editingPlanExitConditions, setEditingPlanExitConditions] = useState("");
  const [editingPlanTargetConditions, setEditingPlanTargetConditions] = useState("");
  const [isSavingPlan, setIsSavingPlan] = useState(false);

  useEffect(() => {
    if (campaign && !thesisInitialized) {
      setThesis(campaign.thesis);
      setThesisInitialized(true);
    }
  }, [campaign, thesisInitialized]);

  useEffect(() => {
    if (campaign && !retrospectiveInitialized) {
      setRetrospective(campaign.retrospective || "");
      setRetrospectiveInitialized(true);
    }
  }, [campaign, retrospectiveInitialized]);

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

  const handleSaveThesis = async () => {
    setThesisError(null);
    setThesisSaveState("saving");

    try {
      await updateCampaign({
        campaignId,
        thesis: thesis.trim(),
      });
      setThesisSaveState("saved");
    } catch (error) {
      setThesisError(error instanceof Error ? error.message : "Failed to save thesis");
      setThesisSaveState("idle");
    }
  };

  const handleAddNote = async (content: string) => {
    await addNote({ campaignId, content });
  };

  const noteForm = useAppForm({
    defaultValues: {
      content: "",
    },
    validators: {
      onChange: ({ value }) => {
        const results = noteSchema.safeParse(value);
        if (!results.success) {
          return results.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setNoteError(null);
      setIsAddingNote(true);

      try {
        const parsed = noteSchema.parse(value);
        await handleAddNote(parsed.content.trim());
        formApi.reset();
      } catch (error) {
        setNoteError(error instanceof Error ? error.message : "Failed to add note");
      } finally {
        setIsAddingNote(false);
      }
    },
  });

  const startEditingNote = (note: Doc<"campaignNotes">) => {
    setEditingNoteId(note._id);
    setEditingNoteContent(note.content);
    setNoteError(null);
  };

  const handleSaveNote = async () => {
    if (!editingNoteId) {
      return;
    }
    if (!editingNoteContent.trim()) {
      setNoteError("Note content is required");
      return;
    }

    setNoteError(null);
    setIsSavingNote(true);

    try {
      await updateNote({ noteId: editingNoteId, content: editingNoteContent.trim() });
      setEditingNoteId(null);
      setEditingNoteContent("");
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Failed to update note");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleSaveRetrospective = async () => {
    setRetrospectiveError(null);
    setRetrospectiveSaveState("saving");

    try {
      await updateCampaign({
        campaignId,
        retrospective: retrospective.trim() || undefined,
      });
      setRetrospectiveSaveState("saved");
    } catch (error) {
      setRetrospectiveError(
        error instanceof Error ? error.message : "Failed to save retrospective",
      );
      setRetrospectiveSaveState("idle");
    }
  };

  const handleCreateTradePlan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!planName.trim() || !planInstrumentSymbol.trim()) {
      setPlanError("Name and instrument symbol are required");
      return;
    }

    setPlanError(null);
    setIsCreatingPlan(true);

    try {
      await createTradePlan({
        campaignId,
        entryConditions: planEntryConditions.trim() || "Awaiting technical confirmation",
        exitConditions: planExitConditions.trim() || "Invalidation or thesis breakdown",
        instrumentSymbol: planInstrumentSymbol.trim().toUpperCase(),
        name: planName.trim(),
        targetConditions: planTargetConditions.trim() || "Take profit on thesis completion",
      });

      setPlanName("");
      setPlanInstrumentSymbol("");
      setPlanEntryConditions("");
      setPlanExitConditions("");
      setPlanTargetConditions("");
      setShowCreateTradePlanForm(false);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Failed to create trade plan");
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const startEditingTradePlan = (plan: Doc<"tradePlans">) => {
    setEditingPlanId(plan._id);
    setEditingPlanName(plan.name);
    setEditingPlanInstrumentSymbol(plan.instrumentSymbol);
    setEditingPlanEntryConditions(plan.entryConditions);
    setEditingPlanExitConditions(plan.exitConditions);
    setEditingPlanTargetConditions(plan.targetConditions);
    setPlanError(null);
  };

  const handleSaveTradePlan = async () => {
    if (!editingPlanId) {
      return;
    }

    if (!editingPlanName.trim() || !editingPlanInstrumentSymbol.trim()) {
      setPlanError("Name and instrument symbol are required");
      return;
    }

    setPlanError(null);
    setIsSavingPlan(true);

    try {
      await updateTradePlan({
        tradePlanId: editingPlanId,
        name: editingPlanName.trim(),
        instrumentSymbol: editingPlanInstrumentSymbol.trim().toUpperCase(),
        entryConditions: editingPlanEntryConditions.trim(),
        exitConditions: editingPlanExitConditions.trim(),
        targetConditions: editingPlanTargetConditions.trim(),
      });
      setEditingPlanId(null);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Failed to update trade plan");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleTradePlanStatusChange = async (
    tradePlanId: Id<"tradePlans">,
    status: TradePlanStatus,
  ) => {
    try {
      await updateTradePlanStatus({ tradePlanId, status });
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "Failed to update trade plan status");
    }
  };

  if (campaign === undefined) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-slate-11">Loading campaign...</div>
      </div>
    );
  }

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
      <Link href="/campaigns" className="mb-2 inline-block text-sm text-slate-11 hover:text-slate-12">
        ← Back to Campaigns
      </Link>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-bold text-slate-12">{campaign.name}</h1>
          <div className="w-44">
            <select
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

        {campaignPL !== undefined && campaignPL.tradeCount > 0 && (
          <p className="mt-2 text-sm text-slate-11">
            Realized P&amp;L:{" "}
            <span className={campaignPL.realizedPL >= 0 ? "text-green-400" : "text-red-400"}>
              {campaignPL.realizedPL >= 0 ? "+" : ""}
              {formatCurrency(campaignPL.realizedPL)}
            </span>
          </p>
        )}

        {statusChangeError && <p className="mt-3 text-sm text-red-300">{statusChangeError}</p>}
      </div>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-2 text-lg font-semibold text-slate-12">Thesis</h2>
        {thesisError && <p className="mb-2 text-sm text-red-300">{thesisError}</p>}
        <textarea
          className="min-h-28 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
          value={thesis}
          onChange={(e) => {
            setThesis(e.target.value);
            setThesisError(null);
            if (thesisSaveState === "saved") {
              setThesisSaveState("idle");
            }
          }}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
            onClick={() => void handleSaveThesis()}
            disabled={thesisSaveState === "saving"}
          >
            Save Thesis
          </button>

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
      </section>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-12">Notes</h2>

        {campaignNotes === undefined ? (
          <p className="text-sm text-slate-11">Loading notes...</p>
        ) : campaignNotes.length === 0 ? (
          <p className="mb-3 text-sm text-slate-11">No notes yet.</p>
        ) : (
          <div className="mb-4 space-y-2">
            {campaignNotes.map((note) => {
              const isEditing = editingNoteId === note._id;
              return (
                <div key={note._id} className="rounded border border-slate-600 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-11">{formatDateTime(note._creationTime)}</span>
                    {!isEditing && (
                      <button
                        type="button"
                        className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-12 hover:bg-slate-700"
                        onClick={() => startEditingNote(note)}
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        className="min-h-24 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                        value={editingNoteContent}
                        onChange={(e) => setEditingNoteContent(e.target.value)}
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
                          onClick={() => void handleSaveNote()}
                          disabled={isSavingNote}
                        >
                          {isSavingNote ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-700"
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditingNoteContent("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-slate-11">{note.content}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {noteError && <p className="mb-2 text-sm text-red-300">{noteError}</p>}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void noteForm.handleSubmit();
          }}
          className="space-y-2"
        >
          <noteForm.AppField name="content">
            {(field) => (
              <field.FieldTextarea
                label="Add note"
                placeholder="Add a note"
                rows={4}
              />
            )}
          </noteForm.AppField>
          <noteForm.AppForm>
            <noteForm.SubmitButton label={isAddingNote ? "Saving..." : "Add Note"} />
          </noteForm.AppForm>
        </form>
      </section>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-12">Trade Plans</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-11">{tradePlans?.length ?? 0} plans</span>
            <button
              type="button"
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
              onClick={() => setShowCreateTradePlanForm((current) => !current)}
            >
              {showCreateTradePlanForm ? "Hide Form" : "Add Trade Plan"}
            </button>
          </div>
        </div>

        {planError && <p className="mb-3 text-sm text-red-300">{planError}</p>}

        {tradePlans === undefined ? (
          <p className="mb-4 text-sm text-slate-11">Loading trade plans...</p>
        ) : tradePlans.length === 0 ? (
          <p className="mb-4 text-sm text-slate-11">No trade plans yet.</p>
        ) : (
          <div className="mb-4 space-y-3">
            {tradePlans.map((plan) => {
              const isEditing = editingPlanId === plan._id;
              return (
                <div key={plan._id} className="rounded border border-slate-600 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-[220px] flex-1">
                      {isEditing ? (
                        <input
                          className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                          value={editingPlanName}
                          onChange={(e) => setEditingPlanName(e.target.value)}
                        />
                      ) : (
                        <p className="font-semibold text-slate-12">{plan.name}</p>
                      )}
                    </div>

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

                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-12 hover:bg-slate-600"
                            onClick={() => void handleSaveTradePlan()}
                            disabled={isSavingPlan}
                          >
                            {isSavingPlan ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-12 hover:bg-slate-700"
                            onClick={() => setEditingPlanId(null)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-12 hover:bg-slate-700"
                          onClick={() => startEditingTradePlan(plan)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div>
                      <p className="mb-1 text-xs text-slate-11">Instrument</p>
                      {isEditing ? (
                        <input
                          className="w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                          value={editingPlanInstrumentSymbol}
                          onChange={(e) => setEditingPlanInstrumentSymbol(e.target.value)}
                        />
                      ) : (
                        <p className="text-sm text-slate-11">{plan.instrumentSymbol}</p>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-xs text-slate-11">Entry conditions</p>
                      {isEditing ? (
                        <textarea
                          className="min-h-20 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                          value={editingPlanEntryConditions}
                          onChange={(e) => setEditingPlanEntryConditions(e.target.value)}
                        />
                      ) : (
                        <p className="text-sm text-slate-11">{plan.entryConditions}</p>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-xs text-slate-11">Exit conditions</p>
                      {isEditing ? (
                        <textarea
                          className="min-h-20 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                          value={editingPlanExitConditions}
                          onChange={(e) => setEditingPlanExitConditions(e.target.value)}
                        />
                      ) : (
                        <p className="text-sm text-slate-11">{plan.exitConditions}</p>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-xs text-slate-11">Target conditions</p>
                      {isEditing ? (
                        <textarea
                          className="min-h-20 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                          value={editingPlanTargetConditions}
                          onChange={(e) => setEditingPlanTargetConditions(e.target.value)}
                        />
                      ) : (
                        <p className="text-sm text-slate-11">{plan.targetConditions}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showCreateTradePlanForm && (
          <form className="grid gap-2 rounded border border-slate-700 p-3" onSubmit={handleCreateTradePlan}>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                placeholder="Trade plan name"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
              />
              <input
                className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
                placeholder="Instrument symbol"
                value={planInstrumentSymbol}
                onChange={(e) => setPlanInstrumentSymbol(e.target.value)}
              />
            </div>
            <textarea
              className="min-h-20 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
              placeholder="Entry conditions"
              value={planEntryConditions}
              onChange={(e) => setPlanEntryConditions(e.target.value)}
            />
            <textarea
              className="min-h-20 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
              placeholder="Exit conditions"
              value={planExitConditions}
              onChange={(e) => setPlanExitConditions(e.target.value)}
            />
            <textarea
              className="min-h-20 rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
              placeholder="Target conditions"
              value={planTargetConditions}
              onChange={(e) => setPlanTargetConditions(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"
                type="submit"
                disabled={isCreatingPlan}
              >
                {isCreatingPlan ? "Creating..." : "Save Trade Plan"}
              </button>
              <button
                type="button"
                className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-700"
                onClick={() => setShowCreateTradePlanForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-12">Retrospective</h2>

        {campaign.status !== "closed" ? (
          <p className="text-sm text-slate-11">Retrospective is available after the campaign is closed.</p>
        ) : (
          <>
            {retrospectiveError && <p className="mb-2 text-sm text-red-300">{retrospectiveError}</p>}
            <textarea
              className="min-h-32 w-full rounded border border-slate-600 bg-slate-700 px-3 py-2 text-slate-12"
              value={retrospective}
              onChange={(e) => {
                setRetrospective(e.target.value);
                if (retrospectiveSaveState === "saved") {
                  setRetrospectiveSaveState("idle");
                }
              }}
              placeholder="What worked, what failed, and what changed your view?"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-12 hover:bg-slate-600"
                onClick={() => void handleSaveRetrospective()}
                disabled={retrospectiveSaveState === "saving"}
              >
                Save Retrospective
              </button>

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

        {trades === undefined ? (
          <p className="text-sm text-slate-11">Loading trades...</p>
        ) : trades.length === 0 ? (
          <p className="text-sm text-slate-11">No trades linked to this campaign yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-11">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Ticker</th>
                  <th className="px-2 py-2">Trade Plan</th>
                  <th className="px-2 py-2">Side</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Price</th>
                  <th className="px-2 py-2">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade._id} className="border-b border-slate-700/60">
                    <td className="px-2 py-2 text-slate-11">{new Date(trade.date).toLocaleDateString("en-US")}</td>
                    <td className="px-2 py-2 text-slate-12">{trade.ticker}</td>
                    <td className="px-2 py-2 text-slate-11">
                      {trade.tradePlanId ? tradePlanNameById.get(trade.tradePlanId) ?? "—" : "—"}
                    </td>
                    <td className="px-2 py-2 text-slate-11">{trade.side}</td>
                    <td className="px-2 py-2 text-slate-11">{trade.quantity}</td>
                    <td className="px-2 py-2 text-slate-11">{formatCurrency(trade.price)}</td>
                    <td className="px-2 py-2">
                      {trade.realizedPL === null ? (
                        <span className="text-slate-11">—</span>
                      ) : (
                        <span className={trade.realizedPL >= 0 ? "text-green-400" : "text-red-400"}>
                          {trade.realizedPL >= 0 ? "+" : ""}
                          {formatCurrency(trade.realizedPL)}
                        </span>
                      )}
                    </td>
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
