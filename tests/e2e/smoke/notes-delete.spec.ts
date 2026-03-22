import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import { APP_PAGE_TITLES, getPageTitle, NOTES_SELECTORS } from "../helpers/selectors";

function extractNoteId(testId: string): string {
  const noteId = testId.replace("notes-note-row-", "");
  if (!noteId) throw new Error("Expected note id in test id.");
  return noteId;
}

test.describe("note delete confirmation", () => {
  let noteId: string;

  test.beforeEach(async ({ page }) => {
    const timestamp = Date.now();
    const noteContent = `E2E delete test ${timestamp}`;

    await page.goto("/notes");
    await waitForAuthenticatedApp(page, APP_PAGE_TITLES.notes);
    await expect(getPageTitle(page, "notes")).toBeVisible();

    // Create a note to test deletion on
    await page
      .getByTestId(NOTES_SELECTORS.addNoteTextarea)
      .fill(noteContent);
    await page.getByTestId(NOTES_SELECTORS.addNoteButton).click();

    const noteRows = page.getByTestId(/^notes-note-row-/);
    await expect(noteRows.first()).toBeVisible();
    const noteRow = noteRows.first();
    const noteRowTestId = await noteRow.getAttribute("data-testid");
    if (!noteRowTestId) throw new Error("Expected data-testid on note row.");
    noteId = extractNoteId(noteRowTestId);

    await expect(
      page.getByTestId(NOTES_SELECTORS.noteContent(noteId)),
    ).toContainText(noteContent);
  });

  test("first click arms the button and shows tooltip, second click deletes", async ({
    page,
  }) => {
    const deleteButton = page.getByTestId(
      NOTES_SELECTORS.deleteNoteButton(noteId),
    );
    const tooltip = page.getByTestId(
      NOTES_SELECTORS.deleteNoteTooltip(noteId),
    );
    const noteRow = page.getByTestId(NOTES_SELECTORS.noteRow(noteId));

    // Hover over the note row to reveal the action buttons
    await noteRow.hover();

    // Tooltip should not be visible initially
    await expect(tooltip).not.toBeVisible();

    // First click arms the button
    await deleteButton.click();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText("Click again to delete");

    // Note should still exist
    await expect(noteRow).toBeVisible();

    // Second click deletes
    await deleteButton.click();
    await expect(noteRow).not.toBeVisible();
  });

  test("clicking outside the delete button disarms it", async ({ page }) => {
    const deleteButton = page.getByTestId(
      NOTES_SELECTORS.deleteNoteButton(noteId),
    );
    const tooltip = page.getByTestId(
      NOTES_SELECTORS.deleteNoteTooltip(noteId),
    );
    const noteRow = page.getByTestId(NOTES_SELECTORS.noteRow(noteId));

    // Hover to reveal action buttons, then arm the delete
    await noteRow.hover();
    await deleteButton.click();
    await expect(tooltip).toBeVisible();

    // Click somewhere else on the page (the note content area)
    await page
      .getByTestId(NOTES_SELECTORS.noteContent(noteId))
      .click();

    // Tooltip should disappear and note should still exist
    await expect(tooltip).not.toBeVisible();
    await expect(noteRow).toBeVisible();

    // Re-hover and click delete once — should arm again, not delete
    await noteRow.hover();
    await deleteButton.click();
    await expect(tooltip).toBeVisible();
    await expect(noteRow).toBeVisible();
  });
});
