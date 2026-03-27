"use client";

import {
  Preloaded,
  useMutation,
  usePreloadedQuery,
  useQuery,
} from "convex/react";
import {
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RetrospectiveSection } from "~/components/RetrospectiveSection";
import { WatchToggleButton } from "~/components/WatchToggleButton";
import { MobileHierarchyBreadcrumbs } from "~/components/app-shell/campaign-trade-plan-hierarchy";
import { useNavigationData } from "~/components/app-shell";
import { Alert, Badge, EmptyState, Select } from "~/components/ui";
import { NotesSection } from "~/components/notes";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import {
  buildHierarchyBreadcrumbs,
  findTradePlanNavigationItem,
  LINKED_TRADE_PLAN_LABEL,
  STANDALONE_TRADE_PLAN_LABEL,
} from "~/lib/campaign-trade-plan-navigation";
import { formatCurrency } from "~/lib/format";
import {
  APP_SHELL_TEST_IDS,
  TRADE_PLAN_DETAIL_TEST_IDS,
  getInboxTradeAcceptButtonTestId,
  getInboxTradePortfolioSelectTestId,
  getInboxTradeRowTestId,
  getTradeRowTestId,
} from "../../../../../shared/e2e/testIds";
import { ImportPostDialog } from "../ImportPostDialog";

type TradePlanStatus = "idea" | "watching" | "active" | "closed";
type SaveState = "idle" | "saving" | "saved";

// --- Inline editable field ---

function InlineEditableField({
  dataTestId,
  label,
  maxLength,
  onSave,
  value,
}: {
  dataTestId: string;
  label: string;
  maxLength?: number;
  onSave: (value: string) => Promise<void>;
  value: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (saveState !== "saved" || isEditing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveState("idle");
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isEditing, saveState]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError(`${label} is required`);
      return;
    }
    setError(null);
    setSaveState("saving");
    try {
      await onSave(trimmed);
      setSaveState("saved");
      setIsEditing(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Failed to save ${label.toLowerCase()}`,
      );
      setSaveState("idle");
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setError(null);
    setIsEditing(false);
    setSaveState("idle");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (!isEditing) {
    return (
      <div className="group flex items-center gap-2">
        <span data-testid={dataTestId}>{value}</span>
        <button
          type="button"
          data-testid={`${dataTestId}-edit-button`}
          aria-label={`Edit ${label}`}
          onClick={() => setIsEditing(true)}
          className="rounded p-1 text-olive-10 opacity-0 transition-opacity hover:bg-olive-4 hover:text-olive-12 group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {saveState === "saved" && (
          <span className="flex items-center gap-1 text-xs text-grass-11">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          data-testid={`${dataTestId}-input`}
          maxLength={maxLength}
          className="rounded-md border border-olive-7 bg-transparent px-2 py-1 text-sm text-olive-12 focus:ring-2 focus:ring-blue-8 focus:outline-none"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          data-testid={`${dataTestId}-save-button`}
          aria-label={`Save ${label}`}
          onClick={() => void handleSave()}
          disabled={saveState === "saving"}
          className="rounded p-1 text-grass-11 hover:bg-grass-3 disabled:opacity-50"
        >
          {saveState === "saving" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          data-testid={`${dataTestId}-cancel-button`}
          aria-label="Cancel editing"
          onClick={handleCancel}
          className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-11">{error}</p>}
    </div>
  );
}

// --- Tactical field editor ---

function TacticalField({
  dataTestId,
  label,
  onSave,
  placeholder,
  value,
}: {
  dataTestId: string;
  label: string;
  onSave: (value: string | null) => Promise<void>;
  placeholder: string;
  value: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value ?? "");
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
    }
  }, [isEditing]);

  useEffect(() => {
    if (saveState !== "saved" || isEditing) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveState("idle");
    }, 2000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isEditing, saveState]);

  const handleSave = async () => {
    setError(null);
    setSaveState("saving");
    try {
      const trimmed = draft.trim();
      await onSave(trimmed || null);
      setSaveState("saved");
      setIsEditing(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Failed to save ${label.toLowerCase()}`,
      );
      setSaveState("idle");
    }
  };

  const handleCancel = () => {
    setDraft(value ?? "");
    setError(null);
    setIsEditing(false);
    setSaveState("idle");
  };

  if (!isEditing) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h4
            className="text-xs font-medium uppercase tracking-wide text-olive-11"
            data-testid={`${dataTestId}-label`}
          >
            {label}
          </h4>
          <div className="flex items-center gap-1">
            {saveState === "saved" && (
              <span className="text-xs text-grass-11">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
            )}
            <button
              type="button"
              data-testid={`${dataTestId}-edit-button`}
              aria-label={`Edit ${label}`}
              onClick={() => setIsEditing(true)}
              className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {value ? (
          <p
            className="whitespace-pre-wrap text-sm text-olive-12"
            data-testid={`${dataTestId}-content`}
          >
            {value}
          </p>
        ) : (
          <p
            className="text-sm italic text-olive-11"
            data-testid={`${dataTestId}-empty`}
          >
            {placeholder}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h4
          className="text-xs font-medium uppercase tracking-wide text-olive-11"
          data-testid={`${dataTestId}-label`}
        >
          {label}
        </h4>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid={`${dataTestId}-save-button`}
            aria-label={`Save ${label}`}
            onClick={() => void handleSave()}
            disabled={saveState === "saving"}
            className="rounded p-1 text-grass-11 hover:bg-grass-3 disabled:opacity-50"
          >
            {saveState === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            data-testid={`${dataTestId}-cancel-button`}
            aria-label="Cancel editing"
            onClick={handleCancel}
            className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        data-testid={`${dataTestId}-textarea`}
        className="min-h-[80px] w-full resize-y rounded-md border border-olive-7 bg-transparent px-3 py-2 text-sm text-olive-12 placeholder:text-olive-9 focus:ring-2 focus:ring-blue-8 focus:outline-none"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") handleCancel();
        }}
      />
      {error && <p className="text-xs text-red-11">{error}</p>}
    </div>
  );
}

export default function TradePlanDetailPageClient({
  tradePlanId,
  preloadedTradePlanWorkspace,
}: {
  tradePlanId: Id<"tradePlans">;
  preloadedTradePlanWorkspace: Preloaded<
    typeof api.tradePlans.getTradePlanWorkspace
  >;
}) {
  const workspace = usePreloadedQuery(preloadedTradePlanWorkspace);
  const tradePlan = workspace?.tradePlan ?? null;
  const summary = workspace?.summary ?? null;
  const notes = workspace?.notes ?? [];
  const trades = workspace?.trades ?? [];
  const accountMappings = workspace?.accountMappings ?? [];
  const inboxTradesForPlan = workspace?.inboxTrades ?? [];
  const portfolios = workspace?.portfolios ?? [];
  const { hierarchy } = useNavigationData();

  const addNote = useMutation(api.notes.addNote);
  const deleteNoteMutation = useMutation(api.notes.deleteNote);
  const updateNoteM = useMutation(api.notes.updateNote);
  const updateTradePlan = useMutation(api.tradePlans.updateTradePlan);
  const updateTradePlanStatus = useMutation(
    api.tradePlans.updateTradePlanStatus,
  );
  const acceptTrade = useMutation(api.imports.acceptTrade);
  const watchItem = useMutation(api.watchlist.watchItem);
  const unwatchItem = useMutation(api.watchlist.unwatchItem);

  const campaigns = useQuery(api.campaigns.listCampaigns) ?? [];
  const [relationshipError, setRelationshipError] = useState<string | null>(
    null,
  );
  const [isChangingRelationship, setIsChangingRelationship] = useState(false);
  const [isEditingCampaign, setIsEditingCampaign] = useState(false);

  const handleCampaignChange = async (
    campaignId: Id<"campaigns"> | null,
  ) => {
    setRelationshipError(null);
    setIsChangingRelationship(true);
    try {
      await updateTradePlan({ tradePlanId, campaignId });
      setIsEditingCampaign(false);
    } catch (error) {
      setRelationshipError(
        error instanceof Error ? error.message : "Failed to update campaign",
      );
    } finally {
      setIsChangingRelationship(false);
    }
  };

  const [pendingPortfolioIds, setPendingPortfolioIds] = useState<
    Record<string, string>
  >({});

  const accountNameByAccountId = useMemo(() => {
    const map = new Map<string, string>();
    for (const mapping of accountMappings) {
      map.set(mapping.accountId, mapping.friendlyName);
    }
    return map;
  }, [accountMappings]);

  const [statusError, setStatusError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [inboxAcceptError, setInboxAcceptError] = useState<string | null>(null);
  const [acceptingInboxTradeIds, setAcceptingInboxTradeIds] = useState<
    Set<string>
  >(new Set());
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const breadcrumbs = buildHierarchyBreadcrumbs(hierarchy, {
    kind: "tradePlan",
    tradePlanId,
  });
  const navigationTradePlan = useMemo(
    () => findTradePlanNavigationItem(hierarchy, tradePlanId),
    [hierarchy, tradePlanId],
  );
  const linkedCampaign = navigationTradePlan?.parentCampaign ?? null;
  const isLinked = linkedCampaign !== null || tradePlan?.campaignId !== null;
  const relationshipLabel = isLinked
    ? LINKED_TRADE_PLAN_LABEL
    : STANDALONE_TRADE_PLAN_LABEL;

  const isWatched = summary?.isWatched ?? false;

  const handleToggleWatch = useCallback(async () => {
    setWatchLoading(true);
    setWatchError(null);
    try {
      if (isWatched) {
        await unwatchItem({
          item: { itemType: "tradePlan", tradePlanId },
        });
      } else {
        await watchItem({
          item: { itemType: "tradePlan", tradePlanId },
        });
      }
    } catch (error) {
      setWatchError(
        error instanceof Error ? error.message : "Failed to update watchlist",
      );
    } finally {
      setWatchLoading(false);
    }
  }, [isWatched, tradePlanId, watchItem, unwatchItem]);

  const handleStatusChange = async (status: TradePlanStatus) => {
    setStatusError(null);
    setIsChangingStatus(true);
    try {
      await updateTradePlanStatus({ tradePlanId, status });
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Failed to update status",
      );
    } finally {
      setIsChangingStatus(false);
    }
  };

  const handleAcceptInboxTrade = async (
    inboxTradeId: Id<"inboxTrades">,
    portfolioId: string,
  ) => {
    setInboxAcceptError(null);
    setAcceptingInboxTradeIds((prev) => {
      const next = new Set(prev);
      next.add(inboxTradeId);
      return next;
    });
    try {
      const result = await acceptTrade({
        inboxTradeId,
        tradePlanId,
        portfolioId: portfolioId
          ? (portfolioId as Id<"portfolios">)
          : undefined,
      });
      if (result.error) {
        setInboxAcceptError(result.error);
      } else if (!result.accepted) {
        setInboxAcceptError("Failed to accept trade");
      }
    } catch (error) {
      setInboxAcceptError(
        error instanceof Error ? error.message : "Failed to accept trade",
      );
    } finally {
      setAcceptingInboxTradeIds((prev) => {
        const next = new Set(prev);
        next.delete(inboxTradeId);
        return next;
      });
    }
  };

  if (tradePlan === null) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-olive-11">Trade plan not found.</p>
        <Link
          href="/trade-plans"
          className="mt-4 inline-block text-sm text-blue-9 hover:underline"
        >
          &larr; Back to trade plans
        </Link>
      </div>
    );
  }

  const assignedInboxTrades = inboxTradesForPlan.filter(
    (t) => t.matchType === "assigned",
  );
  const suggestedInboxTrades = inboxTradesForPlan.filter(
    (t) => t.matchType === "suggested",
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Breadcrumbs */}
      {breadcrumbs !== null ? (
        <MobileHierarchyBreadcrumbs breadcrumbs={breadcrumbs} />
      ) : (
        <Link
          href="/trade-plans"
          data-testid={TRADE_PLAN_DETAIL_TEST_IDS.backLink}
          className="mb-2 inline-block text-sm text-olive-11 hover:text-olive-12 md:hidden"
        >
          &larr; Back to Trade Plans
        </Link>
      )}

      <Link
        href="/trade-plans"
        data-testid={TRADE_PLAN_DETAIL_TEST_IDS.backLinkDesktop}
        className="mb-2 hidden text-sm text-olive-11 hover:text-olive-12 md:inline-block"
      >
        &larr; Back to Trade Plans
      </Link>

      {/* === Section 1: Relationship & Identity Header === */}
      <header className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        {/* Row 1: Title + Symbol */}
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-2xl font-bold text-olive-12 md:text-3xl">
            <InlineEditableField
              dataTestId={APP_SHELL_TEST_IDS.tradePlanName}
              label="Plan Name"
              maxLength={120}
              value={tradePlan.name}
              onSave={async (name) => {
                await updateTradePlan({ tradePlanId, name });
              }}
            />
          </h1>
          <span className="font-semibold text-olive-11">
            <InlineEditableField
              dataTestId={APP_SHELL_TEST_IDS.tradePlanSymbol}
              label="Instrument Symbol"
              maxLength={20}
              value={tradePlan.instrumentSymbol}
              onSave={async (symbol) => {
                await updateTradePlan({
                  tradePlanId,
                  instrumentSymbol: symbol,
                });
              }}
            />
          </span>
        </div>

        {/* Row 2: Relationship context + status/watch controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="group flex items-center gap-2">
            {isEditingCampaign ? (
              <>
                <Select
                  dataTestId={TRADE_PLAN_DETAIL_TEST_IDS.campaignSelect}
                  aria-label="Link to campaign"
                  size="dense"
                  value={tradePlan.campaignId ?? ""}
                  disabled={isChangingRelationship}
                  onChange={(e) => {
                    const value = e.target.value;
                    void handleCampaignChange(
                      value ? (value as Id<"campaigns">) : null,
                    );
                  }}
                >
                  <option value="">Standalone (no campaign)</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign._id} value={campaign._id}>
                      {campaign.name}
                    </option>
                  ))}
                </Select>
                {tradePlan.campaignId && (
                  <button
                    type="button"
                    data-testid={TRADE_PLAN_DETAIL_TEST_IDS.unlinkButton}
                    aria-label="Unlink from campaign"
                    disabled={isChangingRelationship}
                    onClick={() => void handleCampaignChange(null)}
                    className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Cancel editing campaign"
                  onClick={() => setIsEditingCampaign(false)}
                  className="rounded p-1 text-olive-10 hover:bg-olive-4 hover:text-olive-12"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : isLinked ? (
              <>
                <span
                  className="text-xs font-medium uppercase tracking-[0.18em] text-olive-11"
                  data-testid={TRADE_PLAN_DETAIL_TEST_IDS.relationshipLabel}
                >
                  {relationshipLabel}
                </span>
                <span
                  className="text-xs text-olive-11"
                  data-testid={TRADE_PLAN_DETAIL_TEST_IDS.campaignContext}
                >
                  &middot;{" "}
                  <Link
                    href={
                      linkedCampaign?.href ??
                      `/campaigns/${tradePlan.campaignId}`
                    }
                    className="text-blue-9 hover:underline"
                    data-testid={TRADE_PLAN_DETAIL_TEST_IDS.campaignLink}
                  >
                    {linkedCampaign?.name ?? "View Campaign"}
                  </Link>
                </span>
                <button
                  type="button"
                  data-testid={TRADE_PLAN_DETAIL_TEST_IDS.campaignSelect}
                  aria-label="Change campaign"
                  onClick={() => setIsEditingCampaign(true)}
                  className="rounded p-1 text-olive-10 opacity-0 transition-opacity hover:bg-olive-4 hover:text-olive-12 group-hover:opacity-100"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span
                  className="text-xs font-medium uppercase tracking-[0.18em] text-olive-11"
                  data-testid={TRADE_PLAN_DETAIL_TEST_IDS.relationshipLabel}
                >
                  {relationshipLabel}
                </span>
                <button
                  type="button"
                  data-testid={TRADE_PLAN_DETAIL_TEST_IDS.campaignSelect}
                  aria-label="Link to campaign"
                  onClick={() => setIsEditingCampaign(true)}
                  className="rounded px-2 py-0.5 text-xs text-blue-9 hover:bg-olive-4 hover:text-blue-11"
                >
                  Link to campaign
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Select
              dataTestId={TRADE_PLAN_DETAIL_TEST_IDS.statusSelect}
              aria-label="Trade plan status"
              size="sm"
              value={tradePlan.status}
              disabled={isChangingStatus}
              onChange={(e) =>
                void handleStatusChange(e.target.value as TradePlanStatus)
              }
            >
              <option value="idea">Idea</option>
              <option value="watching">Watching</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </Select>

            {tradePlan.status === "closed" && tradePlan.closedAt && (
              <span
                className="text-xs text-olive-11"
                data-testid="trade-plan-closed-date"
              >
                Closed{" "}
                {new Date(tradePlan.closedAt).toLocaleDateString("en-US")}
              </span>
            )}

            <WatchToggleButton
              dataTestId="trade-plan-watch-toggle"
              isWatched={isWatched}
              itemName={tradePlan.name}
              onClick={() => void handleToggleWatch()}
              disabled={watchLoading}
            />
          </div>
        </div>

        {statusError && (
          <Alert variant="error" className="mt-3">
            {statusError}
          </Alert>
        )}
        {watchError && (
          <Alert variant="error" className="mt-3">
            {watchError}
          </Alert>
        )}
        {relationshipError && (
          <Alert variant="error" className="mt-3">
            {relationshipError}
          </Alert>
        )}
      </header>

      {/* === Section 2: Tactical Plan === */}
      <section
        className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
        data-testid={TRADE_PLAN_DETAIL_TEST_IDS.tacticalSection}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-olive-12">
            Tactical Plan
          </h2>
          <button
            type="button"
            data-testid={TRADE_PLAN_DETAIL_TEST_IDS.importFollowUpButton}
            onClick={() => setShowImportDialog(true)}
            className="rounded-md border border-olive-7 px-3 py-1.5 text-xs font-medium text-olive-12 hover:bg-olive-4"
          >
            Import follow-up
          </button>
        </div>
        <div className="space-y-5">
          <TacticalField
            dataTestId="trade-plan-rationale"
            label="Rationale"
            placeholder="Why this trade? What is the thesis?"
            value={tradePlan.rationale}
            onSave={async (val) => {
              await updateTradePlan({ tradePlanId, rationale: val });
            }}
          />
          <TacticalField
            dataTestId="trade-plan-entry-conditions"
            label="Entry Conditions"
            placeholder="What conditions must be met to enter?"
            value={tradePlan.entryConditions}
            onSave={async (val) => {
              await updateTradePlan({ tradePlanId, entryConditions: val });
            }}
          />
          <TacticalField
            dataTestId="trade-plan-target-conditions"
            label="Target Conditions"
            placeholder="What does success look like? Price targets, milestones."
            value={tradePlan.targetConditions}
            onSave={async (val) => {
              await updateTradePlan({ tradePlanId, targetConditions: val });
            }}
          />
          <TacticalField
            dataTestId="trade-plan-exit-conditions"
            label="Exit Conditions"
            placeholder="When should the position be closed? Stop-loss, time, invalidation."
            value={tradePlan.exitConditions}
            onSave={async (val) => {
              await updateTradePlan({ tradePlanId, exitConditions: val });
            }}
          />
        </div>
      </section>

      {/* === Section 3: Notes === */}
      <section className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4">
        <h2 className="mb-3 text-lg font-semibold text-olive-12">Notes</h2>
        <NotesSection
          defaultShowEvidence
          testIdPrefix="trade-plan"
          notes={notes}
          onAddNote={async (content, chartUrls) => {
            await addNote({ tradePlanId, content, chartUrls });
          }}
          onDeleteNote={async (noteId) => {
            await deleteNoteMutation({ noteId: noteId as Id<"notes"> });
          }}
          onUpdateNote={async (noteId, content, chartUrls) => {
            await updateNoteM({
              noteId: noteId as Id<"notes">,
              content,
              chartUrls,
            });
          }}
        />
      </section>

      {/* === Section 4: Execution Context === */}
      <section
        className="mb-6 rounded-lg border border-olive-6 bg-olive-2 p-4"
        data-testid="trade-plan-execution-section"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            className="text-lg font-semibold text-olive-12"
            data-testid="trade-plan-trades-section-title"
          >
            Execution
          </h2>
          {summary && (
            <span className="text-xs text-olive-11">
              {summary.execution.tradeCount}{" "}
              {summary.execution.tradeCount === 1 ? "trade" : "trades"}
              {summary.execution.totalPendingCount > 0 && (
                <> &middot; {summary.execution.totalPendingCount} pending</>
              )}
            </span>
          )}
        </div>

        {inboxAcceptError && (
          <Alert
            variant="error"
            className="mb-3"
            onDismiss={() => setInboxAcceptError(null)}
          >
            {inboxAcceptError}
          </Alert>
        )}

        {/* Pending inbox trades - assigned */}
        {assignedInboxTrades.length > 0 && (
          <div className="mb-4">
            <h3
              className="mb-2 text-xs font-medium uppercase tracking-wide text-olive-11"
              data-testid="trade-plan-assigned-pending-title"
            >
              Pending &mdash; Assigned
            </h3>
            <div className="overflow-x-auto rounded-md border border-slate-6 bg-slate-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-6 text-left text-xs font-medium text-slate-11">
                    <th className="pl-4 pr-2 py-2"></th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Portfolio / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedInboxTrades.map(({ inboxTrade }) => (
                    <InboxTradeRow
                      key={inboxTrade._id}
                      inboxTrade={inboxTrade}
                      matchType="assigned"
                      accountNameByAccountId={accountNameByAccountId}
                      portfolios={portfolios}
                      portfolioId={
                        pendingPortfolioIds[inboxTrade._id] ?? ""
                      }
                      onPortfolioChange={(val) =>
                        setPendingPortfolioIds((prev) => ({
                          ...prev,
                          [inboxTrade._id]: val,
                        }))
                      }
                      onAccept={(portfolioId) =>
                        void handleAcceptInboxTrade(
                          inboxTrade._id,
                          portfolioId,
                        )
                      }
                      isAccepting={acceptingInboxTradeIds.has(inboxTrade._id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pending inbox trades - suggested */}
        {suggestedInboxTrades.length > 0 && (
          <div className="mb-4">
            <h3
              className="mb-2 text-xs font-medium uppercase tracking-wide text-olive-11"
              data-testid="trade-plan-suggested-pending-title"
            >
              Pending &mdash; Symbol Matches
            </h3>
            <div className="overflow-x-auto rounded-md border border-slate-6 bg-slate-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-6 text-left text-xs font-medium text-slate-11">
                    <th className="pl-4 pr-2 py-2"></th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Price</th>
                    <th className="px-3 py-2">Portfolio / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestedInboxTrades.map(({ inboxTrade }) => (
                    <InboxTradeRow
                      key={inboxTrade._id}
                      inboxTrade={inboxTrade}
                      matchType="suggested"
                      accountNameByAccountId={accountNameByAccountId}
                      portfolios={portfolios}
                      portfolioId={
                        pendingPortfolioIds[inboxTrade._id] ?? ""
                      }
                      onPortfolioChange={(val) =>
                        setPendingPortfolioIds((prev) => ({
                          ...prev,
                          [inboxTrade._id]: val,
                        }))
                      }
                      onAccept={(portfolioId) =>
                        void handleAcceptInboxTrade(
                          inboxTrade._id,
                          portfolioId,
                        )
                      }
                      isAccepting={acceptingInboxTradeIds.has(inboxTrade._id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Accepted trades */}
        {trades.length > 0 ? (
          <div>
            <h3
              className="mb-2 text-xs font-medium uppercase tracking-wide text-olive-11"
              data-testid="trade-plan-linked-trades-title"
            >
              Linked Trades
            </h3>
            <div className="overflow-x-auto rounded-md border border-slate-6 bg-slate-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-6 text-left text-xs font-medium text-slate-11">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Side</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <tr
                      key={trade._id}
                      className="border-b border-slate-6/60"
                      data-testid={getTradeRowTestId(
                        trade.ticker,
                        trade.date,
                      )}
                    >
                      <td className="px-3 py-2 text-slate-11">
                        {new Date(trade.date).toLocaleDateString("en-US")}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-12">
                        {trade.ticker}
                      </td>
                      <td className="px-3 py-2 text-slate-11">
                        {trade.brokerageAccountId
                          ? (accountNameByAccountId.get(
                              trade.brokerageAccountId,
                            ) ?? trade.brokerageAccountId)
                          : "\u2014"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            trade.side === "buy" ? "success" : "danger"
                          }
                        >
                          {trade.side}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-11">
                        {trade.quantity}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-11">
                        {formatCurrency(trade.price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          inboxTradesForPlan.length === 0 && (
            <EmptyState
              dataTestId={TRADE_PLAN_DETAIL_TEST_IDS.tradesEmptyState}
              title="No trades linked to this plan yet"
              description="Trades will appear here once they are linked or imported."
            />
          )
        )}
      </section>

      {/* === Section 5: Retrospective === */}
      <RetrospectiveSection
        isClosed={tradePlan.status === "closed"}
        parentId={tradePlanId}
        parentKind="tradePlan"
        testIdPrefix="trade-plan"
      />

      <ImportPostDialog
        mode="follow-up"
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        tradePlanId={tradePlanId}
      />
    </div>
  );
}

// --- Inbox Trade Row Component ---

function InboxTradeRow({
  accountNameByAccountId,
  inboxTrade,
  isAccepting,
  matchType,
  onAccept,
  onPortfolioChange,
  portfolioId,
  portfolios,
}: {
  accountNameByAccountId: Map<string, string>;
  inboxTrade: {
    _id: Id<"inboxTrades">;
    brokerageAccountId?: string;
    date?: number;
    externalId?: string;
    price?: number;
    quantity?: number;
    side?: "buy" | "sell";
    ticker?: string;
  };
  isAccepting: boolean;
  matchType: "assigned" | "suggested";
  onAccept: (portfolioId: string) => void;
  onPortfolioChange: (value: string) => void;
  portfolioId: string;
  portfolios: Array<{ _id: Id<"portfolios">; name: string }>;
}) {
  return (
    <tr
      className="border-b border-slate-6"
      data-testid={getInboxTradeRowTestId(
        inboxTrade.ticker ?? "trade",
        inboxTrade.externalId ?? inboxTrade._id,
      )}
    >
      <td className="pl-4 pr-2 py-2">
        <Badge variant={matchType === "suggested" ? "info" : "warning"}>
          {matchType === "suggested" ? "Suggested" : "Pending"}
        </Badge>
      </td>
      <td className="px-3 py-2 text-slate-11">
        {inboxTrade.date
          ? new Date(inboxTrade.date).toLocaleDateString("en-US")
          : "---"}
      </td>
      <td className="px-3 py-2 text-slate-12">
        {inboxTrade.ticker ?? "---"}
      </td>
      <td className="px-3 py-2 text-slate-11">
        {accountNameByAccountId.get(inboxTrade.brokerageAccountId ?? "") ??
          inboxTrade.brokerageAccountId ??
          "---"}
      </td>
      <td className="px-3 py-2">
        <Badge
          variant={
            inboxTrade.side === "buy"
              ? "success"
              : inboxTrade.side === "sell"
                ? "danger"
                : "neutral"
          }
        >
          {inboxTrade.side ?? "---"}
        </Badge>
      </td>
      <td className="px-3 py-2 tabular-nums text-slate-11">
        {inboxTrade.quantity ?? "---"}
      </td>
      <td className="px-3 py-2 tabular-nums text-slate-11">
        {inboxTrade.price !== undefined
          ? formatCurrency(inboxTrade.price)
          : "---"}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Select
            dataTestId={getInboxTradePortfolioSelectTestId(
              inboxTrade.ticker ?? "trade",
              inboxTrade.externalId ?? inboxTrade._id,
            )}
            aria-label={`Portfolio for ${inboxTrade.ticker || "trade"}`}
            size="dense"
            surface="dense"
            value={portfolioId}
            onChange={(e) => onPortfolioChange(e.target.value)}
          >
            <option value="">No portfolio</option>
            {portfolios?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </Select>
          <button
            type="button"
            data-testid={getInboxTradeAcceptButtonTestId(
              inboxTrade.ticker ?? "trade",
              inboxTrade.externalId ?? inboxTrade._id,
            )}
            aria-label={`Accept ${inboxTrade.ticker ?? "trade"} from inbox`}
            onClick={() => onAccept(portfolioId)}
            className="rounded p-1.5 text-grass-11 hover:bg-grass-3 disabled:opacity-50"
            title="Accept"
            disabled={isAccepting}
          >
            {isAccepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}
