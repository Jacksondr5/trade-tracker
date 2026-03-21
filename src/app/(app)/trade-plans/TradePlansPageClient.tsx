"use client";

import { Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { z } from "zod";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  useAppForm,
} from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { capitalize, formatDate } from "~/lib/format";
import {
  APP_PAGE_TITLES,
  getCloseTradePlanButtonTestId,
  getStandaloneTradePlanCardTestId,
  getTradePlanLinkTestId,
  getTradePlanRowTestId,
  TRADE_PLANS_INDEX_TEST_IDS,
} from "../../../../shared/e2e/testIds";

type TradePlanStatus = "active" | "closed" | "idea" | "watching";
type RelationshipFilter = "all" | "linked" | "standalone";

const STATUS_BADGE_VARIANT: Record<
  TradePlanStatus,
  "info" | "neutral" | "success" | "warning"
> = {
  idea: "neutral",
  watching: "warning",
  active: "success",
  closed: "neutral",
};

const createTradePlanSchema = z.object({
  instrumentSymbol: z.string().trim().min(1, "Instrument symbol is required"),
  name: z.string().trim().min(1, "Plan name is required"),
});

type TradePlanSummary = {
  createdAt: number;
  execution: {
    latestTradeDate: number | null;
    pendingAssignedCount: number;
    pendingSuggestedCount: number;
    totalPendingCount: number;
    tradeCount: number;
  };
  id: Id<"tradePlans">;
  instrumentSymbol: string;
  isWatched: boolean;
  lifecycle: {
    closedAt: number | null;
    isClosed: boolean;
  };
  name: string;
  relationship: {
    kind: "linked" | "standalone";
    parentCampaign: {
      href: string;
      id: Id<"campaigns">;
      name: string;
    } | null;
  };
  status: TradePlanStatus;
};

export default function TradePlansPageClient({
  preloadedTradePlans,
}: {
  preloadedTradePlans: Preloaded<
    typeof api.tradePlans.listTradePlanWorkspaceSummaries
  >;
}) {
  const tradePlans = usePreloadedQuery(preloadedTradePlans);
  const createTradePlan = useMutation(api.tradePlans.createTradePlan);
  const updateTradePlanStatus = useMutation(
    api.tradePlans.updateTradePlanStatus,
  );

  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [relationshipFilter, setRelationshipFilter] =
    useState<RelationshipFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TradePlanStatus | "all">(
    "all",
  );
  const [pendingCloseIds, setPendingCloseIds] = useState<Set<Id<"tradePlans">>>(
    () => new Set(),
  );
  const [closeErrors, setCloseErrors] = useState<
    Map<Id<"tradePlans">, string>
  >(() => new Map());

  const filteredPlans = useMemo(() => {
    let plans = tradePlans as TradePlanSummary[];
    if (relationshipFilter !== "all") {
      plans = plans.filter(
        (plan) => plan.relationship.kind === relationshipFilter,
      );
    }
    if (statusFilter !== "all") {
      plans = plans.filter((plan) => plan.status === statusFilter);
    }
    return plans;
  }, [tradePlans, relationshipFilter, statusFilter]);

  const stats = useMemo(() => {
    const plans = tradePlans as TradePlanSummary[];
    const active = plans.filter((p) => p.status === "active").length;
    const totalPending = plans.reduce(
      (sum, p) => sum + p.execution.totalPendingCount,
      0,
    );
    return { total: plans.length, active, pending: totalPending };
  }, [tradePlans]);

  const form = useAppForm({
    defaultValues: {
      instrumentSymbol: "",
      name: "",
    },
    validators: {
      onChange: ({ value }) => {
        const result = createTradePlanSchema.safeParse(value);
        if (!result.success) {
          return result.error.flatten().fieldErrors;
        }
        return undefined;
      },
    },
    onSubmit: async ({ value, formApi }) => {
      setError(null);
      try {
        const parsed = createTradePlanSchema.parse(value);
        await createTradePlan({
          instrumentSymbol: parsed.instrumentSymbol.toUpperCase(),
          name: parsed.name,
        });
        formApi.reset();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create trade plan",
        );
      }
    },
  });

  const handleClosePlan = async (tradePlanId: Id<"tradePlans">) => {
    setCloseErrors((current) => {
      const next = new Map(current);
      next.delete(tradePlanId);
      return next;
    });
    setPendingCloseIds((current) => {
      const next = new Set(current);
      next.add(tradePlanId);
      return next;
    });

    try {
      await updateTradePlanStatus({
        status: "closed",
        tradePlanId,
      });
    } catch (err) {
      setCloseErrors((current) => {
        const next = new Map(current);
        next.set(
          tradePlanId,
          err instanceof Error ? err.message : "Failed to close trade plan",
        );
        return next;
      });
    } finally {
      setPendingCloseIds((current) => {
        const next = new Set(current);
        next.delete(tradePlanId);
        return next;
      });
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold text-olive-12"
            data-testid={APP_PAGE_TITLES.tradePlans}
          >
            Trade Plans
          </h1>
          <p className="max-w-2xl text-sm text-olive-11">
            Manage standalone and linked trade plans across all campaigns.
          </p>
        </div>
        <Button
          dataTestId={TRADE_PLANS_INDEX_TEST_IDS.createFormToggle}
          variant="default"
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          {showCreateForm ? "Cancel" : "New trade plan"}
        </Button>
      </div>

      {/* Create form (collapsible) */}
      {showCreateForm && (
        <Card
          className="mb-6 border-olive-6 bg-olive-2"
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.createFormSection}
        >
          <CardHeader className="px-4 pt-4 pb-0">
            <CardTitle className="text-sm font-semibold text-olive-12">
              New standalone trade plan
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4">
            {error && (
              <Alert
                variant="error"
                className="mb-3"
                onDismiss={() => setError(null)}
              >
                {error}
              </Alert>
            )}
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <form.AppField name="name">
                {(field) => (
                  <field.FieldInput label="Plan name" placeholder="Plan name" />
                )}
              </form.AppField>
              <form.AppField name="instrumentSymbol">
                {(field) => (
                  <field.FieldInput label="Symbol" placeholder="e.g. CPER" />
                )}
              </form.AppField>
              <form.AppForm>
                <form.SubmitButton
                  dataTestId="create-trade-plan-button"
                  label="Create"
                />
              </form.AppForm>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      <div className="mb-4 flex gap-4">
        <div
          className="text-sm text-olive-11"
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.summaryTotal}
        >
          <span className="font-medium text-olive-12">{stats.total}</span>{" "}
          {stats.total === 1 ? "plan" : "plans"}
        </div>
        <div
          className="text-sm text-olive-11"
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.summaryActive}
        >
          <span className="font-medium text-olive-12">{stats.active}</span>{" "}
          active
        </div>
        {stats.pending > 0 && (
          <div
            className="text-sm text-amber-11"
            data-testid={TRADE_PLANS_INDEX_TEST_IDS.summaryPending}
          >
            <span className="font-medium text-amber-12">{stats.pending}</span>{" "}
            pending
          </div>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-olive-6">
          <FilterTab
            active={relationshipFilter === "all"}
            dataTestId={TRADE_PLANS_INDEX_TEST_IDS.filterAll}
            label="All"
            onClick={() => setRelationshipFilter("all")}
          />
          <FilterTab
            active={relationshipFilter === "linked"}
            dataTestId={TRADE_PLANS_INDEX_TEST_IDS.filterLinked}
            label="Linked"
            onClick={() => setRelationshipFilter("linked")}
          />
          <FilterTab
            active={relationshipFilter === "standalone"}
            dataTestId={TRADE_PLANS_INDEX_TEST_IDS.filterStandalone}
            label="Standalone"
            onClick={() => setRelationshipFilter("standalone")}
          />
        </div>
        <select
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.statusFilterSelect}
          className="rounded-md border border-olive-6 bg-olive-2 px-2.5 py-1.5 text-sm text-olive-12 focus:outline-none focus:ring-1 focus:ring-blue-8"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as TradePlanStatus | "all")
          }
        >
          <option value="all">All statuses</option>
          <option value="idea">Idea</option>
          <option value="watching">Watching</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Plan list */}
      {tradePlans.length === 0 ? (
        <Card
          className="border-olive-6 bg-olive-2"
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.emptyState}
        >
          <CardContent className="px-4 py-6">
            <p className="text-sm font-medium text-olive-12">
              No trade plans yet
            </p>
            <p className="mt-1 text-sm text-olive-11">
              Create a standalone trade plan or add one from a campaign.
            </p>
            {!showCreateForm && (
              <Button
                dataTestId={TRADE_PLANS_INDEX_TEST_IDS.emptyStateCta}
                variant="default"
                className="mt-3"
                onClick={() => setShowCreateForm(true)}
              >
                New trade plan
              </Button>
            )}
          </CardContent>
        </Card>
      ) : filteredPlans.length === 0 ? (
        <Card className="border-olive-6 bg-olive-2">
          <CardContent className="px-4 py-6">
            <p className="text-sm text-olive-11">
              No trade plans match the current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className="space-y-2"
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.planList}
        >
          {filteredPlans.map((plan) => (
            <TradePlanRow
              key={plan.id}
              plan={plan}
              isPendingClose={pendingCloseIds.has(plan.id)}
              closeError={closeErrors.get(plan.id) ?? null}
              onClose={handleClosePlan}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterTab({
  active,
  dataTestId,
  label,
  onClick,
}: {
  active: boolean;
  dataTestId: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={dataTestId}
      className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
        active
          ? "bg-blue-3 text-blue-12"
          : "bg-olive-2 text-olive-11 hover:bg-olive-3 hover:text-olive-12"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function TradePlanRow({
  plan,
  isPendingClose,
  closeError,
  onClose,
}: {
  plan: TradePlanSummary;
  isPendingClose: boolean;
  closeError: string | null;
  onClose: (id: Id<"tradePlans">) => void;
}) {
  const isLinked = plan.relationship.kind === "linked";

  return (
    <div
      data-testid={getTradePlanRowTestId(plan.id)}
      className="rounded-lg border border-olive-6 bg-olive-2 p-3 transition-colors hover:border-olive-7 hover:bg-olive-3/50"
    >
      {/* Legacy test ID for backwards compat with e2e targeting standalone cards */}
      {!isLinked && (
        <span
          data-testid={getStandaloneTradePlanCardTestId(plan.id)}
          className="hidden"
          aria-hidden="true"
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/trade-plans/${plan.id}`}
          data-testid={getTradePlanLinkTestId(plan.id)}
          className="min-w-0 flex-1"
        >
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-olive-12">
              {plan.name}
            </span>
            <span className="shrink-0 text-sm text-olive-11">
              {plan.instrumentSymbol}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-olive-11">
            {isLinked && plan.relationship.parentCampaign ? (
              <span className="truncate">
                {plan.relationship.parentCampaign.name}
              </span>
            ) : (
              <span>Standalone</span>
            )}
            {plan.execution.tradeCount > 0 && (
              <>
                <span className="text-olive-8">·</span>
                <span>
                  {plan.execution.tradeCount}{" "}
                  {plan.execution.tradeCount === 1 ? "trade" : "trades"}
                </span>
              </>
            )}
            {plan.execution.totalPendingCount > 0 && (
              <>
                <span className="text-olive-8">·</span>
                <span className="text-amber-11">
                  {plan.execution.totalPendingCount} pending
                </span>
              </>
            )}
            {plan.execution.latestTradeDate && (
              <>
                <span className="text-olive-8">·</span>
                <span>
                  Last trade {formatDate(plan.execution.latestTradeDate)}
                </span>
              </>
            )}
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[plan.status]}>
            {capitalize(plan.status)}
          </Badge>
          {plan.status !== "closed" && (
            <Button
              dataTestId={getCloseTradePlanButtonTestId(plan.id)}
              variant="secondary"
              className="border border-olive-6 bg-olive-3 text-olive-12 hover:bg-olive-4"
              onClick={() => {
                onClose(plan.id);
              }}
              disabled={isPendingClose}
            >
              {isPendingClose ? "Closing..." : "Close"}
            </Button>
          )}
        </div>
      </div>
      {closeError && (
        <Alert variant="error" className="mt-3">
          {closeError}
        </Alert>
      )}
    </div>
  );
}
