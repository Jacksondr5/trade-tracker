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
import { buildTradePlanIndexRelationshipLabel } from "~/lib/campaign-trade-plan-navigation";
import {
  APP_PAGE_TITLES,
  getStandaloneTradePlanCardTestId,
  getTradePlanLinkTestId,
  getTradePlanRowTestId,
  getTradePlansStatusTestId,
  TRADE_PLANS_INDEX_TEST_IDS,
} from "../../../../shared/e2e/testIds";
import { ImportPostDialog } from "./ImportPostDialog";

type TradePlanStatus = "active" | "closed" | "idea" | "watching";
type RelationshipFilter = "all" | "bravos" | "linked" | "standalone";

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
    kind: "bravos" | "linked" | "standalone";
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
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [relationshipFilter, setRelationshipFilter] =
    useState<RelationshipFilter>("all");
  const [statusFilter, setStatusFilter] = useState<TradePlanStatus | "all">(
    "all",
  );

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
            Manage linked, standalone, and Bravos trade plans across all
            campaigns.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            dataTestId={TRADE_PLANS_INDEX_TEST_IDS.importFromServiceButton}
            variant="outline"
            onClick={() => setShowImportDialog(true)}
          >
            Import from Bravos
          </Button>
          <Button
            aria-controls={TRADE_PLANS_INDEX_TEST_IDS.createFormSection}
            aria-expanded={showCreateForm}
            dataTestId={TRADE_PLANS_INDEX_TEST_IDS.createFormToggle}
            variant="default"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? "Cancel" : "New trade plan"}
          </Button>
        </div>
      </div>

      <ImportPostDialog
        mode="create"
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
      />

      {/* Create form (collapsible) */}
      {showCreateForm && (
        <Card
          id={TRADE_PLANS_INDEX_TEST_IDS.createFormSection}
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
                  dataTestId={TRADE_PLANS_INDEX_TEST_IDS.createSubmitButton}
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
        <div
          className={
            stats.pending > 0
              ? "text-sm text-amber-11"
              : "text-sm text-olive-11"
          }
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.summaryPending}
        >
          <span
            className={
              stats.pending > 0
                ? "font-medium text-amber-12"
                : "font-medium text-olive-12"
            }
          >
            {stats.pending}
          </span>{" "}
          pending
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          aria-label="Filter by relationship"
          role="group"
          className="flex rounded-md border border-olive-6"
        >
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
            active={relationshipFilter === "bravos"}
            dataTestId={TRADE_PLANS_INDEX_TEST_IDS.filterBravos}
            label="Bravos"
            onClick={() => setRelationshipFilter("bravos")}
          />
          <FilterTab
            active={relationshipFilter === "standalone"}
            dataTestId={TRADE_PLANS_INDEX_TEST_IDS.filterStandalone}
            label="Standalone"
            onClick={() => setRelationshipFilter("standalone")}
          />
        </div>
        <div
          aria-label="Filter by status"
          role="group"
          className="flex rounded-md border border-olive-6"
          data-testid={TRADE_PLANS_INDEX_TEST_IDS.statusFilterSelect}
        >
          {(
            [
              { value: "all", label: "All" },
              { value: "idea", label: "Idea" },
              { value: "watching", label: "Watching" },
              { value: "active", label: "Active" },
              { value: "closed", label: "Closed" },
            ] as const
          ).map((option) => (
            <FilterTab
              key={option.value}
              active={statusFilter === option.value}
              dataTestId={getTradePlansStatusTestId(option.value)}
              label={option.label}
              onClick={() => setStatusFilter(option.value)}
            />
          ))}
        </div>
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
            <TradePlanRow key={plan.id} plan={plan} />
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
      aria-pressed={active}
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

function TradePlanRow({ plan }: { plan: TradePlanSummary }) {
  const isLinked = plan.relationship.kind === "linked";
  const isStandalone = plan.relationship.kind === "standalone";

  return (
    <div
      data-testid={
        isStandalone
          ? getStandaloneTradePlanCardTestId(plan.id)
          : getTradePlanRowTestId(plan.id)
      }
      className="rounded-lg border border-olive-6 bg-olive-2 p-3 transition-colors hover:border-olive-7 hover:bg-olive-3/50"
    >
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
            <span className="truncate">
              {buildTradePlanIndexRelationshipLabel({
                navigationCategory: plan.relationship.kind,
                parentCampaign: plan.relationship.parentCampaign,
              })}
            </span>
            {isLinked && plan.relationship.parentCampaign === null ? (
              <>
                <span className="text-olive-8">·</span>
                <span>Linked (missing campaign metadata)</span>
              </>
            ) : null}
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
        <Badge variant={STATUS_BADGE_VARIANT[plan.status]}>
          {capitalize(plan.status)}
        </Badge>
      </div>
    </div>
  );
}
