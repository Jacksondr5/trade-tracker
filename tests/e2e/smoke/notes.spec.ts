import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import { APP_PAGE_TITLES, getPageTitle } from "../helpers/selectors";

test("notes page loads and supports add and edit workflow", async ({
  page,
}) => {
  const timestamp = Date.now();
  const noteContent = `E2E general note ${timestamp}`;
  const updatedNoteContent = `${noteContent} edited`;

  await page.goto("/notes");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.notes);
  await expect(getPageTitle(page, "notes")).toBeVisible();

  // Add a general note
  await page.getByTestId("notes-add-note-textarea").fill(noteContent);
  await page.getByTestId("notes-add-note-button").click();

  const noteRows = page.getByTestId(/^notes-note-row-/);
  await expect(noteRows.first()).toBeVisible();
  const noteRow = noteRows.first();
  await expect(noteRow.getByTestId(/^notes-note-content-/)).toContainText(
    noteContent,
  );

  // Edit the note
  const noteRowTestId = await noteRow.getAttribute("data-testid");
  if (!noteRowTestId) {
    throw new Error("Expected data-testid on note row.");
  }
  const noteId = noteRowTestId.replace("notes-note-row-", "");

  await page.getByTestId(`notes-edit-note-button-${noteId}`).click();
  await page
    .getByTestId(`notes-edit-note-textarea-${noteId}`)
    .fill(updatedNoteContent);
  await page.getByTestId(`notes-save-note-button-${noteId}`).click();
  await expect(
    page.getByTestId(`notes-note-content-${noteId}`),
  ).toContainText(updatedNoteContent);
});
