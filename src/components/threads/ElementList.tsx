import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui";
import { getElementRowTestId } from "../../../shared/e2e/testIds";
import {
  ELEMENT_AUTHOR_LABELS,
  ELEMENT_STATUS_LABELS,
  elementStatusBadgeVariant,
  formatAsOf,
  formatElementValue,
} from "./format";
import type { ElementView } from "./types";

export function ElementChip({ element }: { element: ElementView }) {
  const isCounterpart = element.author === "counterpart";
  return (
    <span
      className={cn(
        "inline-flex max-w-[22rem] items-center gap-1.5 rounded border px-2 py-0.5 text-xs",
        isCounterpart
          ? "border-dashed border-blue-7 bg-blue-2 text-blue-12"
          : "border-olive-7 bg-olive-3 text-olive-12",
      )}
      title={`${element.statement} — ${ELEMENT_AUTHOR_LABELS[element.author]}, ${ELEMENT_STATUS_LABELS[element.status]}`}
    >
      <span className="min-w-0 truncate">{element.statement}</span>
      <span className="shrink-0 text-[10px] font-medium tracking-wide uppercase opacity-80">
        {ELEMENT_AUTHOR_LABELS[element.author]} · {ELEMENT_STATUS_LABELS[element.status]}
      </span>
    </span>
  );
}

export function ElementRow({
  actions,
  element,
  exempted = false,
  note,
}: {
  actions?: ReactNode;
  element: ElementView;
  exempted?: boolean;
  note?: string | null;
}) {
  const isCounterpart = element.author === "counterpart";
  const isRetired =
    element.status === "superseded" || element.status === "dropped";
  return (
    <li
      className={cn(
        "rounded-md border px-3 py-2",
        isCounterpart
          ? "border-dashed border-blue-7 bg-blue-2/40"
          : "border-olive-6 bg-olive-2",
        exempted && "opacity-60",
      )}
      data-testid={getElementRowTestId(element.id)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm text-olive-12",
              isRetired && "text-slate-11 line-through",
            )}
          >
            {element.statement}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-11">
            <Badge variant={isCounterpart ? "info" : "neutral"}>
              {ELEMENT_AUTHOR_LABELS[element.author]}
            </Badge>
            <Badge variant={elementStatusBadgeVariant(element.status)}>
              {ELEMENT_STATUS_LABELS[element.status]}
            </Badge>
            {exempted ? <Badge variant="neutral">Exempted</Badge> : null}
            {note ? <span className="italic">{note}</span> : null}
            {element.kind ? <span>{element.kind}</span> : null}
            {element.asOf ? <span>{formatAsOf(element.asOf)}</span> : null}
            {element.value ? (
              <span className="tabular-nums">
                {formatElementValue(element.value)}
              </span>
            ) : null}
            {element.noteId ? (
              <span className="text-blue-11" title="Cites note">
                §
              </span>
            ) : null}
            {element.statusEvidence ? (
              <span>Evidence: {element.statusEvidence}</span>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </li>
  );
}

export function ElementList({
  dataTestId,
  elements,
  emptyLabel,
  exemptedIds,
  noteFor,
  renderActions,
}: {
  dataTestId?: string;
  elements: ElementView[];
  emptyLabel: string;
  exemptedIds?: ReadonlySet<string>;
  noteFor?: (element: ElementView) => string | null;
  renderActions?: (element: ElementView) => ReactNode;
}) {
  if (elements.length === 0) {
    return (
      <p className="text-sm text-slate-11" data-testid={dataTestId}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul className="space-y-2" data-testid={dataTestId}>
      {elements.map((element) => (
        <ElementRow
          key={element.id}
          element={element}
          exempted={exemptedIds?.has(element.id)}
          note={noteFor?.(element)}
          actions={renderActions?.(element)}
        />
      ))}
    </ul>
  );
}
