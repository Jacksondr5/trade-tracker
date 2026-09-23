"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button } from "~/components/ui";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { formatCurrency, formatDate } from "~/lib/format";
import {
  getElementAgreeTestId,
  getElementDropTestId,
  getElementSupersedeTestId,
  getEpisodeAddElementToggleTestId,
  getEpisodeCardTestId,
  getEpisodeEditPlanTestId,
  getEpisodeEndorseDraftTestId,
  getEpisodeHistoryToggleTestId,
  getEpisodeShelveTestId,
} from "../../../shared/e2e/testIds";
import { AddElementForm } from "./AddElementForm";
import { DropElementForm } from "./DropElementForm";
import { ElementList } from "./ElementList";
import {
  LIFECYCLE_LABELS,
  formatPosition,
  getMutationErrorMessage,
  lifecycleBadgeVariant,
} from "./format";
import { PlanEditForm } from "./PlanEditForm";
import { PlanSectionList } from "./PlanSectionList";
import {
  PLAN_SECTION_LABELS,
  PLAN_SECTION_ORDER,
  type ElementView,
  type PlanVersionView,
  type ResolvedEpisode,
} from "./types";

function PlanVersionSections({
  dataTestId,
  version,
}: {
  dataTestId: string;
  version: PlanVersionView;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid={dataTestId}>
      {PLAN_SECTION_ORDER.map((key) => (
        <PlanSectionList
          key={key}
          label={PLAN_SECTION_LABELS[key]}
          lines={version.sections[key]}
          dataTestId={`${dataTestId}-${key}`}
        />
      ))}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-sm font-semibold text-olive-12">{children}</h3>
  );
}

export function EpisodeCard({
  defaultCollapsed = false,
  resolved,
}: {
  defaultCollapsed?: boolean;
  resolved: ResolvedEpisode;
}) {
  const { episode } = resolved;
  const episodeId = episode.id;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [supersedes, setSupersedes] = useState<ElementView | null>(null);
  const [addingElement, setAddingElement] = useState(false);
  const [droppingId, setDroppingId] = useState<Id<"planElements"> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const setElementStatus = useMutation(api.threads.setElementStatusFromApp);
  const endorsePlanVersion = useMutation(api.threads.endorsePlanVersionFromApp);
  const setEpisodeShelved = useMutation(api.threads.setEpisodeShelvedFromApp);

  const exemptedIds = useMemo(
    () => new Set<string>(resolved.campaignRules.exempted.map((rule) => rule.id)),
    [resolved.campaignRules.exempted],
  );
  // Proposals already listed under "Since checkpoint" are not repeated here.
  const openProposals = useMemo(() => {
    const sinceIds = new Set(resolved.itemsSinceCheckpoint.map((item) => item.id));
    return resolved.openProposals.filter((element) => !sinceIds.has(element.id));
  }, [resolved.itemsSinceCheckpoint, resolved.openProposals]);
  const beforeCheckpointIds = useMemo(
    () =>
      new Set(
        resolved.openProposals
          .filter((element) => element.beforeCheckpoint)
          .map((element) => element.id),
      ),
    [resolved.openProposals],
  );
  const campaignRules = useMemo(
    () => [...resolved.campaignRules.applicable, ...resolved.campaignRules.exempted],
    [resolved.campaignRules],
  );

  const isShelved = episode.shelvedAt !== null;
  const canShelve =
    !isShelved &&
    (episode.lifecycle === "idea" || episode.lifecycle === "watching") &&
    resolved.trades.length === 0;
  // Closed episodes are read-only; shelved ones keep their controls.
  const isEditable = episode.lifecycle !== "closed";

  // If the episode closes while an editor is open, close the editor.
  useEffect(() => {
    if (isEditable) return;
    setEditingPlan(false);
    setAddingElement(false);
    setDroppingId(null);
    setSupersedes(null);
  }, [isEditable]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(getMutationErrorMessage(caught, fallback));
    }
  }

  const renderElementActions = (element: ElementView) => {
    if (
      !isEditable ||
      element.status === "superseded" ||
      element.status === "dropped"
    ) {
      return null;
    }
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {element.status === "proposed" ? (
          <Button
            size="sm"
            variant="secondary"
            dataTestId={getElementAgreeTestId(element.id)}
            onClick={() =>
              void run(
                () => setElementStatus({ elementId: element.id, status: "agreed" }),
                "Failed to agree element",
              )
            }
          >
            Agree
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          dataTestId={getElementSupersedeTestId(element.id)}
          onClick={() => {
            setSupersedes(element);
            setAddingElement(true);
          }}
        >
          Supersede
        </Button>
        <Button
          size="sm"
          variant="ghost"
          dataTestId={getElementDropTestId(element.id)}
          onClick={() => setDroppingId(element.id)}
        >
          Drop
        </Button>
      </div>
    );
  };

  const renderActionsWithDrop = (element: ElementView) => (
    <>
      {renderElementActions(element)}
      {droppingId === element.id ? (
        <DropElementForm
          elementId={element.id}
          onCancel={() => setDroppingId(null)}
          onDone={() => setDroppingId(null)}
        />
      ) : null}
    </>
  );

  return (
    <article
      className="rounded-lg border border-olive-6 bg-olive-2 p-4"
      data-testid={getEpisodeCardTestId(episodeId)}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={lifecycleBadgeVariant(episode.lifecycle)}>
            {LIFECYCLE_LABELS[episode.lifecycle]}
          </Badge>
          {isShelved ? <Badge variant="neutral">Shelved</Badge> : null}
          <span className="text-sm text-olive-11">
            {episode.portfolioName ?? "Portfolio not yet known"}
          </span>
          {episode.campaignId && episode.campaignName ? (
            <Link
              href={`/campaigns/${episode.campaignId}`}
              className="text-sm text-blue-11 hover:underline"
            >
              {episode.campaignName}
            </Link>
          ) : null}
          {episode.source !== "user" ? (
            <Badge variant="neutral">External</Badge>
          ) : null}
          <span className="text-sm text-olive-12 tabular-nums">
            {resolved.position ? (
              <>
                <Badge
                  variant={resolved.position.direction === "long" ? "success" : "danger"}
                  className="mr-1"
                >
                  {resolved.position.direction === "long" ? "Long" : "Short"}
                </Badge>
                {formatPosition(resolved.position)}
              </>
            ) : (
              "Flat"
            )}
          </span>
          <span className="text-xs text-slate-11">
            Opened {formatDate(episode.openedAt)}
            {episode.closedAt ? ` · Closed ${formatDate(episode.closedAt)}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {isShelved ? (
            <Button
              size="sm"
              variant="secondary"
              dataTestId={getEpisodeShelveTestId(episodeId)}
              onClick={() =>
                void run(
                  () => setEpisodeShelved({ episodeId, shelved: false }),
                  "Failed to unshelve episode",
                )
              }
            >
              Unshelve
            </Button>
          ) : canShelve ? (
            <Button
              size="sm"
              variant="secondary"
              dataTestId={getEpisodeShelveTestId(episodeId)}
              onClick={() =>
                void run(
                  () => setEpisodeShelved({ episodeId, shelved: true }),
                  "Failed to shelve episode",
                )
              }
            >
              Shelve
            </Button>
          ) : null}
          {isEditable && !editingPlan ? (
            <Button
              size="sm"
              variant="secondary"
              dataTestId={getEpisodeEditPlanTestId(episodeId)}
              onClick={() => {
                setEditingPlan(true);
                setCollapsed(false);
              }}
            >
              {resolved.checkpoint ? "Edit plan" : "Draft checkpoint"}
            </Button>
          ) : null}
          {defaultCollapsed ? (
            <Button
              size="sm"
              variant="ghost"
              dataTestId={`episode-card-toggle-${episodeId}`}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? "Show" : "Hide"}
            </Button>
          ) : null}
        </div>
      </header>

      {error ? (
        <Alert
          variant="error"
          className="mt-3"
          data-testid={`episode-error-${episodeId}`}
          onDismiss={() => setError(null)}
        >
          {error}
        </Alert>
      ) : null}

      {collapsed ? null : (
        <div className="mt-4 space-y-5">
          {editingPlan ? (
            <PlanEditForm
              episodeId={episodeId}
              baseVersionNumber={resolved.checkpoint?.versionNumber ?? null}
              observedRevision={resolved.latestRevision}
              checkpoint={resolved.checkpoint?.sections ?? null}
              onCancel={() => setEditingPlan(false)}
              onSaved={() => setEditingPlan(false)}
            />
          ) : null}

          <section>
            <SectionHeading>
              {resolved.checkpoint
                ? `Checkpoint v${resolved.checkpoint.versionNumber}`
                : "Checkpoint"}
            </SectionHeading>
            {resolved.checkpoint ? (
              <PlanVersionSections
                version={resolved.checkpoint}
                dataTestId={`episode-checkpoint-${episodeId}`}
              />
            ) : (
              <p className="text-sm text-slate-11">No checkpoint yet.</p>
            )}
          </section>

          {resolved.draft ? (
            <section className="rounded-md border border-dashed border-amber-7 bg-amber-2/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <SectionHeading>
                  Draft v{resolved.draft.versionNumber} (not endorsed)
                </SectionHeading>
                {isEditable ? (
                <Button
                  size="sm"
                  dataTestId={getEpisodeEndorseDraftTestId(episodeId)}
                  onClick={() =>
                    void run(
                      () =>
                        endorsePlanVersion({
                          episodeId,
                          versionNumber: resolved.draft!.versionNumber,
                        }),
                      "Failed to endorse draft",
                    )
                  }
                >
                  Endorse v{resolved.draft.versionNumber}
                </Button>
                ) : null}
              </div>
              <PlanVersionSections
                version={resolved.draft}
                dataTestId={`episode-draft-${episodeId}`}
              />
            </section>
          ) : null}

          <section>
            <SectionHeading>
              {resolved.checkpoint ? "Since checkpoint" : "Items"}
            </SectionHeading>
            <ElementList
              dataTestId={`episode-since-checkpoint-${episodeId}`}
              elements={resolved.itemsSinceCheckpoint}
              emptyLabel={
                resolved.checkpoint
                  ? "No items since the checkpoint."
                  : "Nothing recorded yet."
              }
              renderActions={renderActionsWithDrop}
            />
          </section>

          {openProposals.length > 0 ? (
            <section>
              <SectionHeading>Open proposals</SectionHeading>
              <ElementList
                dataTestId={`episode-open-proposals-${episodeId}`}
                elements={openProposals}
                emptyLabel="No open proposals."
                noteFor={(element) =>
                  beforeCheckpointIds.has(element.id) ? "before checkpoint" : null
                }
                renderActions={renderActionsWithDrop}
              />
            </section>
          ) : null}

          {campaignRules.length > 0 ? (
            <section>
              <SectionHeading>Campaign rules</SectionHeading>
              <ElementList
                dataTestId={`episode-campaign-rules-${episodeId}`}
                elements={campaignRules}
                emptyLabel="No campaign rules."
                exemptedIds={exemptedIds}
              />
            </section>
          ) : null}

          <section>
            <Button
              size="sm"
              variant="ghost"
              dataTestId={getEpisodeHistoryToggleTestId(episodeId)}
              onClick={() => setHistoryOpen((value) => !value)}
            >
              {historyOpen ? "Hide history" : "Show history"} (
              {resolved.history.total})
            </Button>
            {historyOpen ? (
              <div className="mt-2 space-y-3">
                {resolved.history.truncated ? (
                  <Alert variant="info">
                    Showing the first {resolved.history.items.length} of{" "}
                    {resolved.history.total} items.
                  </Alert>
                ) : null}
                <ElementList
                  dataTestId={`episode-history-${episodeId}`}
                  elements={resolved.history.items}
                  emptyLabel="No history."
                  renderActions={renderActionsWithDrop}
                />
                {resolved.planVersions.length > 0 ? (
                  <ul className="flex flex-wrap gap-2 text-xs text-slate-11">
                    {resolved.planVersions.map((version) => (
                      <li key={version.id}>
                        v{version.versionNumber}
                        {version.endorsed ? " endorsed" : " draft"} ·{" "}
                        {formatDate(version.createdAt)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>

          <section>
            <SectionHeading>Trades</SectionHeading>
            {resolved.trades.length === 0 ? (
              <p className="text-sm text-slate-11">No linked trades.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-slate-6">
                <table className="w-full text-sm">
                  <thead className="bg-slate-2 text-xs font-medium text-slate-11">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Side</th>
                      <th className="px-3 py-2 text-right">Quantity</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-left">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-6">
                    {resolved.trades.map((trade) => (
                      <tr key={trade.id} data-testid={`episode-trade-row-${trade.id}`}>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-12">
                          {formatDate(trade.date)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={trade.side === "buy" ? "success" : "danger"}>
                            {trade.side === "buy" ? "Buy" : "Sell"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-12 tabular-nums">
                          {trade.quantity}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-12 tabular-nums">
                          {formatCurrency(trade.price)}
                        </td>
                        <td className="px-3 py-2 text-slate-11">{trade.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <SectionHeading>Episode notes</SectionHeading>
            {resolved.notes.items.length === 0 ? (
              <p className="text-sm text-slate-11">No episode notes.</p>
            ) : (
              <ul className="space-y-2">
                {resolved.notes.items.map((note) => (
                  <li
                    key={note.id}
                    className="rounded-md border border-olive-6 bg-olive-1 p-3"
                    data-testid={`episode-note-${note.id}`}
                  >
                    <p className="text-xs text-slate-11">
                      {formatDate(note.noteDate)}
                      {note.origin === "retrospective" ? " · Retrospective" : ""}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-olive-12">
                      {note.content}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {resolved.notes.truncated ? (
              <p className="mt-2 text-xs text-slate-11">Older notes not shown.</p>
            ) : null}
          </section>

          {isEditable ? (
            <section>
              {addingElement ? (
                <div className="rounded-md border border-olive-6 bg-olive-1 p-3">
                  <AddElementForm
                    episodeId={episodeId}
                    supersedes={supersedes}
                    onClearSupersedes={() => setSupersedes(null)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    dataTestId={`episode-add-element-close-${episodeId}`}
                    onClick={() => {
                      setAddingElement(false);
                      setSupersedes(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  dataTestId={getEpisodeAddElementToggleTestId(episodeId)}
                  onClick={() => setAddingElement(true)}
                >
                  Add element
                </Button>
              )}
            </section>
          ) : null}
        </div>
      )}
    </article>
  );
}
