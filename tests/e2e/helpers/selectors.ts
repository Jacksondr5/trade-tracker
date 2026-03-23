import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import {
  APP_PAGE_TITLES,
  APP_SHELL_TEST_IDS,
  NAVIGATION_SECTION_TEST_IDS,
  NAVIGATION_TEST_IDS,
  TRADE_PLANS_INDEX_TEST_IDS,
  getCommandPaletteItemTestId,
  getTradePlansStatusTestId,
  getCampaignRowTestId,
  getLocalHierarchyCampaignChildrenToggleTestId,
  getLocalHierarchyItemTestId,
  getLocalHierarchyWatchToggleTestId,
  getRetrospectiveSectionTestId,
  getRetrospectiveTextareaTestId,
  getSaveRetrospectiveButtonTestId,
  getCancelRetrospectiveButtonTestId,
  getEditRetrospectiveButtonTestId,
  getStandaloneTradePlanCardTestId,
  getTradeRowTestId,
  getNoteComposerTextareaTestId,
  getNoteComposerSubmitButtonTestId,
  getNoteRowTestId,
  getNoteContentTestId,
  getDeleteNoteButtonTestId,
  getDeleteNoteButtonTooltipTestId,
  getEditNoteButtonTestId,
  getEditNoteTextareaTestId,
  getSaveNoteButtonTestId,
} from "../../../shared/e2e/testIds";

export { APP_PAGE_TITLES, NAVIGATION_SECTION_TEST_IDS, NAVIGATION_TEST_IDS };

export function getNavigationLink(
  page: Page,
  key: keyof typeof NAVIGATION_TEST_IDS,
): Locator {
  return page.getByTestId(NAVIGATION_TEST_IDS[key]);
}

export function getNavigationSection(
  page: Page,
  key: keyof typeof NAVIGATION_SECTION_TEST_IDS,
): Locator {
  return page.getByTestId(NAVIGATION_SECTION_TEST_IDS[key]);
}

export function getPageTitle(
  page: Page,
  key: keyof typeof APP_PAGE_TITLES,
): Locator {
  return page.getByTestId(APP_PAGE_TITLES[key]);
}

export function getEditCampaignName(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.editCampaignName);
}

export function getTradePlanNameInput(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput);
}

export function getTradePlanNameDisplay(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanName);
}

export function getTradePlanNameEditButton(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameEditButton);
}

export function getTradePlanNameSaveButton(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameSaveButton);
}

export function getTradePlanSymbolDisplay(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanSymbol);
}

export function getTradePlanSymbolEditButton(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanSymbolEditButton);
}

export function getTradePlanSymbolInput(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanSymbolInput);
}

export function getTradePlanSymbolSaveButton(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.tradePlanSymbolSaveButton);
}

export function getNameInput(page: Page): Locator {
  return page.getByTestId("name-input");
}

export function getThesisTextarea(page: Page): Locator {
  return page.getByTestId("thesis-textarea");
}

export function getInstrumentSymbolInput(page: Page): Locator {
  return page.getByTestId("instrumentSymbol-input");
}

export function getCreateTradePlanButton(page: Page): Locator {
  return page.getByTestId(TRADE_PLANS_INDEX_TEST_IDS.createSubmitButton);
}

export function getTradePlansStatusFilter(page: Page, status: string): Locator {
  return page.getByTestId(getTradePlansStatusTestId(status));
}

export function getCreateCampaignButton(page: Page): Locator {
  return page.getByTestId("create-campaign-button");
}

export function getCreateLinkedTradePlanButton(page: Page): Locator {
  return page.getByTestId("create-linked-trade-plan-button");
}

export function getCampaignStatusSelect(page: Page): Locator {
  return page.getByTestId("campaign-status-select");
}

export function getNewCampaignPageTitle(page: Page): Locator {
  return page.getByTestId("new-campaign-page-title");
}

export function getToggleLocalGroupStandaloneTradePlans(page: Page): Locator {
  return page.getByTestId(
    APP_SHELL_TEST_IDS.toggleLocalGroupStandaloneTradePlans,
  );
}

export function getOpenCommandPaletteDesktop(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.openCommandPaletteDesktop);
}

export function getOpenNavigationDrawer(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.openNavigationDrawer);
}

export function getMobileNavigationDrawer(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.mobileNavigationDrawer);
}

export function getCommandPaletteInput(page: Page): Locator {
  return page.getByTestId(APP_SHELL_TEST_IDS.commandPaletteInput);
}

export function getCampaignRow(page: Page): Locator {
  return getCampaignRowByName(page, E2E_SMOKE_FIXTURES.campaign.name);
}

export function getCampaignRowByName(page: Page, name: string): Locator {
  return page.getByTestId(getCampaignRowTestId(name));
}

export function getCreateFormToggle(page: Page): Locator {
  return page.getByTestId(TRADE_PLANS_INDEX_TEST_IDS.createFormToggle);
}

export async function openTradePlanCreateForm(page: Page): Promise<void> {
  const formSection = page.getByTestId(
    TRADE_PLANS_INDEX_TEST_IDS.createFormSection,
  );
  if (!(await formSection.isVisible())) {
    await getCreateFormToggle(page).click();
    await expect(formSection).toBeVisible();
  }
}

export function getStandaloneTradePlanLink(page: Page): Locator {
  return page
    .getByTestId(/^standalone-trade-plan-card-/)
    .filter({ hasText: E2E_SMOKE_FIXTURES.standaloneTradePlan.name })
    .getByTestId(/^trade-plan-link-/);
}

export async function getSeededStandaloneTradePlanId(
  page: Page,
): Promise<string> {
  return getTradePlanIdFromHref(getStandaloneTradePlanLink(page));
}

async function getTradePlanIdFromHref(locator: Locator): Promise<string> {
  const href = await locator.getAttribute("href");
  const tradePlanId = href?.match(/\/trade-plans\/([^/]+)$/)?.[1];

  if (!tradePlanId) {
    throw new Error("Expected trade plan id in link href.");
  }

  return tradePlanId;
}

export async function getNewTradePlanIdFromListPage(
  page: Page,
  previousHrefs: Set<string>,
): Promise<string> {
  let createdHref: string | null = null;

  await expect
    .poll(async () => {
      const hrefs = (await page
        .getByTestId(/^trade-plan-link-/)
        .evaluateAll(
          (elements, priorHrefs) =>
            elements
              .map((element) => element.getAttribute("href"))
              .filter(
                (href): href is string =>
                  Boolean(href) && !priorHrefs.includes(href),
              ),
          Array.from(previousHrefs),
        )) as string[];

      createdHref = hrefs[0] ?? null;
      return createdHref;
    })
    .not.toBeNull();

  if (!createdHref) {
    throw new Error("Expected a new trade plan link after creation.");
  }

  const createdTradePlanId = createdHref.match(/\/trade-plans\/([^/]+)$/)?.[1];
  if (!createdTradePlanId) {
    throw new Error("Expected created trade plan id in list link.");
  }

  return createdTradePlanId;
}

export async function getOnlyLinkedTradePlanIdFromCampaignDetail(
  page: Page,
): Promise<string> {
  const linkedTradePlanRows = page.getByTestId(/^linked-trade-plan-row-/);
  await expect(linkedTradePlanRows).toHaveCount(1);

  const linkedTradePlanRowTestId = await linkedTradePlanRows
    .first()
    .getAttribute("data-testid");

  if (!linkedTradePlanRowTestId) {
    throw new Error("Expected data-testid on linked trade plan row.");
  }

  return linkedTradePlanRowTestId.replace("linked-trade-plan-row-", "");
}

export function getStandaloneTradePlanCard(page: Page, id: string): Locator {
  return page.getByTestId(getStandaloneTradePlanCardTestId(id));
}

export function getLinkedTradeRow(page: Page): Locator {
  return page.getByTestId(
    getTradeRowTestId(
      E2E_SMOKE_FIXTURES.linkedTradePlan.instrumentSymbol,
      E2E_SMOKE_FIXTURES.trades[0].date,
    ),
  );
}

export function getSeededCampaignChildrenToggle(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyCampaignChildrenToggleTestId(
      E2E_SMOKE_FIXTURES.campaign.name,
    ),
  );
}

export function getSeededHierarchyCampaignLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId("campaign", E2E_SMOKE_FIXTURES.campaign.name),
  );
}

export function getSeededHierarchyLinkedTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "campaign-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededHierarchyStandaloneTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "standalone-trade-plan",
      E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
    ),
  );
}

export function getSeededWatchlistCampaignLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "watchlist-campaign",
      E2E_SMOKE_FIXTURES.campaign.name,
    ),
  );
}

export function getSeededWatchlistLinkedTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededWatchlistStandaloneTradePlanLink(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
    ),
  );
}

export function getSeededLinkedTradePlanWatchToggle(page: Page): Locator {
  return page.getByTestId(
    getLocalHierarchyWatchToggleTestId(
      "campaign-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededWatchlistLinkedTradePlanWatchToggle(
  page: Page,
): Locator {
  return page.getByTestId(
    getLocalHierarchyWatchToggleTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededCommandPaletteWatchlistCampaignItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "watchlist-campaign",
      E2E_SMOKE_FIXTURES.campaign.name,
    ),
  );
}

export function getSeededCommandPaletteWatchlistLinkedTradePlanItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getSeededCommandPaletteWatchlistStandaloneTradePlanItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "watchlist-trade-plan",
      E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
    ),
  );
}

export function getSeededCommandPaletteLinkedTradePlanItem(
  page: Page,
): Locator {
  return page.getByTestId(
    getCommandPaletteItemTestId(
      "trade-plan",
      E2E_SMOKE_FIXTURES.linkedTradePlan.name,
    ),
  );
}

export function getRetrospectiveSection(page: Page, prefix: string): Locator {
  return page.getByTestId(getRetrospectiveSectionTestId(prefix));
}

export function getRetrospectiveTextarea(page: Page, prefix: string): Locator {
  return page.getByTestId(getRetrospectiveTextareaTestId(prefix));
}

export function getSaveRetrospectiveButton(
  page: Page,
  prefix: string,
): Locator {
  return page.getByTestId(getSaveRetrospectiveButtonTestId(prefix));
}

export function getCancelRetrospectiveButton(
  page: Page,
  prefix: string,
): Locator {
  return page.getByTestId(getCancelRetrospectiveButtonTestId(prefix));
}

export const NOTES_SELECTORS = {
  addNoteTextarea: getNoteComposerTextareaTestId("notes"),
  addNoteButton: getNoteComposerSubmitButtonTestId("notes"),
  noteRow: (noteId: string) => getNoteRowTestId("notes", noteId),
  noteContent: (noteId: string) => getNoteContentTestId("notes", noteId),
  deleteNoteButton: (noteId: string) =>
    getDeleteNoteButtonTestId("notes", noteId),
  deleteNoteTooltip: (noteId: string) =>
    getDeleteNoteButtonTooltipTestId("notes", noteId),
  editNoteButton: (noteId: string) => getEditNoteButtonTestId("notes", noteId),
  editNoteTextarea: (noteId: string) =>
    getEditNoteTextareaTestId("notes", noteId),
  saveNoteButton: (noteId: string) => getSaveNoteButtonTestId("notes", noteId),
} as const;

export function extractNoteId(testId: string): string {
  const prefix = getNoteRowTestId("notes", "");
  if (!testId.startsWith(prefix)) {
    throw new Error(
      `Expected test id to start with "${prefix}", got "${testId}"`,
    );
  }

  const noteId = testId.slice(prefix.length);
  if (!noteId) {
    throw new Error("Expected note id in test id.");
  }

  return noteId;
}

export async function deleteNoteById(
  page: Page,
  noteId: string,
): Promise<void> {
  const noteRow = page.getByTestId(NOTES_SELECTORS.noteRow(noteId));
  if (!(await noteRow.isVisible())) {
    return;
  }

  await noteRow.hover();

  const deleteButton = page.getByTestId(
    NOTES_SELECTORS.deleteNoteButton(noteId),
  );
  const tooltip = page.getByTestId(NOTES_SELECTORS.deleteNoteTooltip(noteId));

  // If the button is not already armed, click once to arm it
  if (!(await tooltip.isVisible())) {
    await deleteButton.click();
    await expect(tooltip).toBeVisible();
  }

  // Confirm the deletion
  await deleteButton.click();
  await expect(noteRow).not.toBeVisible();
}

export function getEditRetrospectiveButton(
  page: Page,
  prefix: string,
): Locator {
  return page.getByTestId(getEditRetrospectiveButtonTestId(prefix));
}
