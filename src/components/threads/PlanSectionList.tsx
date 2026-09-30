import { formatAsOf, formatElementValue } from "./format";
import type { DisplayLine } from "./types";

export function PlanLineText({ line }: { line: DisplayLine }) {
  const citation = line.noteId ? "note" : line.elementId ? "element" : null;
  return (
    <span className="text-sm text-olive-12">
      {line.text}
      {line.value ? (
        <span className="ml-2 text-xs text-slate-11 tabular-nums">
          {formatElementValue(line.value)}
        </span>
      ) : null}
      {line.asOf ? (
        <span className="ml-2 text-xs text-slate-11">{formatAsOf(line.asOf)}</span>
      ) : null}
      {citation ? (
        // A quiet source marker, not a link: the line was compiled from a
        // recorded element or note.
        <span
          className="ml-1 text-xs text-slate-10"
          title={`Compiled from a recorded ${citation}`}
          aria-label={`Compiled from a recorded ${citation}`}
        >
          §
        </span>
      ) : null}
    </span>
  );
}

export function PlanSectionList({
  label,
  lines,
  dataTestId,
}: {
  dataTestId?: string;
  label: string;
  lines: DisplayLine[];
}) {
  return (
    <div data-testid={dataTestId}>
      <p className="text-xs font-medium tracking-wide text-olive-11 uppercase">
        {label}
      </p>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm text-slate-11">—</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {lines.map((line, index) => (
            <li key={`${index}-${line.text}`}>
              <PlanLineText line={line} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
