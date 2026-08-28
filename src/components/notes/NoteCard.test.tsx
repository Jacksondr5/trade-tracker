import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { api } from "~/convex/_generated/api";
import { NoteMetadataBadges } from "./NoteCard";

function renderBadges(note: { origin?: "retrospective"; ticker?: string }) {
  return renderToStaticMarkup(
    <NoteMetadataBadges note={note} noteId="note-1" testIdPrefix="notes" />,
  );
}

describe("NoteMetadataBadges", () => {
  it("resolves Convex imports through the tsconfig path aliases", () => {
    expect(api.notes.getGeneralNotes).toBeDefined();
  });

  it("renders an uppercase ticker badge when a ticker is present", () => {
    const markup = renderBadges({ ticker: "GDX" });

    expect(markup).toContain('data-testid="notes-note-ticker-badge-note-1"');
    expect(markup).toContain(">GDX</span>");
    expect(markup).not.toContain("note-origin-badge");
  });

  it("renders no badges when note metadata is absent", () => {
    expect(renderBadges({})).toBe("");
  });

  it("renders a distinct retrospective origin badge", () => {
    const markup = renderBadges({ origin: "retrospective" });

    expect(markup).toContain('data-testid="notes-note-origin-badge-note-1"');
    expect(markup).toContain(">Retrospective</span>");
    expect(markup).not.toContain("note-ticker-badge");
  });
});
