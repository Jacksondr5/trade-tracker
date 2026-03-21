import { expect, test } from "@playwright/test";
import {
  APP_SHELL_TEST_IDS,
  getInboxTradeAcceptButtonTestId,
  getInboxTradeRowTestId,
  getTradePlanLinkTestId,
  getTradeRowTestId,
} from "../../../shared/e2e/testIds";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import { runConvexFunction } from "../helpers/convex";
import { getConfiguredBaseUrl, isLocalPlaywrightTarget } from "../helpers/env";
import {
  APP_PAGE_TITLES,
  getCreateCampaignButton,
  getCreateLinkedTradePlanButton,
  getCreateTradePlanButton,
  getInstrumentSymbolInput,
  getNameInput,
  getNewTradePlanIdFromListPage,
  getOnlyLinkedTradePlanIdFromCampaignDetail,
  getSeededStandaloneTradePlanId,
  getStandaloneTradePlanCard,
  getStandaloneTradePlanLink,
  getThesisTextarea,
} from "../helpers/selectors";

test("seeded standalone trade plan and hierarchy render", async ({ page }) => {
  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);

  await expect(getStandaloneTradePlanLink(page)).toBeVisible();
  const standaloneTradePlanId = await getSeededStandaloneTradePlanId(page);

  await getStandaloneTradePlanLink(page).click();

  await expect(page).toHaveURL(
    new RegExp(`/trade-plans/${standaloneTradePlanId}$`),
  );

  await expect(
    page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput),
  ).toHaveValue(E2E_SMOKE_FIXTURES.standaloneTradePlan.name);
  await expect(page.getByTestId("trade-plan-symbol-input")).toHaveValue(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.instrumentSymbol,
  );
  await expect(page.getByTestId("trade-plan-back-link-desktop")).toBeVisible();
  await expect(
    page.getByTestId("trade-plan-trades-section-title"),
  ).toBeVisible();
});

test("standalone trade plans can be created from the list page", async ({
  page,
}) => {
  const createdPlanName = `${E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.name} ${Date.now()}`;

  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);
  const standaloneTradePlanCards = page.getByTestId(
    /^standalone-trade-plan-card-/,
  );
  const tradePlanLinks = page.getByTestId(/^trade-plan-link-/);
  const initialCardCount = await standaloneTradePlanCards.count();
  const initialHrefs = new Set(
    (await tradePlanLinks.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")).filter(Boolean),
    )) as string[],
  );

  await getNameInput(page).fill(createdPlanName);
  await getInstrumentSymbolInput(page).fill(
    E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.instrumentSymbol,
  );
  await getCreateTradePlanButton(page).click();

  await expect(standaloneTradePlanCards).toHaveCount(initialCardCount + 1);

  const createdTradePlanId = await getNewTradePlanIdFromListPage(
    page,
    initialHrefs,
  );

  await expect(
    getStandaloneTradePlanCard(page, createdTradePlanId),
  ).toContainText(createdPlanName);
});

test("trade plan workspace covers standalone and linked detail flows", async ({
  page,
}) => {
  const timestamp = Date.now();
  const standalonePlanName = `E2E Standalone Plan ${timestamp}`;
  const standaloneUpdatedName = `${standalonePlanName} Updated`;
  const linkedCampaignName = `E2E Linked Campaign ${timestamp}`;
  const linkedPlanName = `E2E Linked Detail Plan ${timestamp}`;
  const linkedUpdatedName = `${linkedPlanName} Updated`;
  const standaloneNote = `Standalone note ${timestamp}`;
  const updatedStandaloneNote = `${standaloneNote} edited`;
  const standaloneUpdatedSymbol = "ETH";
  const linkedUpdatedSymbol = "AMD";

  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);

  await getNameInput(page).fill(standalonePlanName);
  await getInstrumentSymbolInput(page).fill("SOL");
  const tradePlanLinks = page.getByTestId(/^trade-plan-link-/);
  const initialStandaloneHrefs = new Set(
    (await tradePlanLinks.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")).filter(Boolean),
    )) as string[],
  );
  await getCreateTradePlanButton(page).click();

  const standaloneTradePlanId = await getNewTradePlanIdFromListPage(
    page,
    initialStandaloneHrefs,
  );
  const createdStandalonePlanLink = page.getByTestId(
    getTradePlanLinkTestId(standaloneTradePlanId),
  );
  await expect(createdStandalonePlanLink).toBeVisible();
  await createdStandalonePlanLink.click();

  await expect(page.getByTestId("trade-plan-relationship-label")).toContainText(
    "Standalone",
  );
  await expect(page.getByTestId("trade-plan-campaign-context")).toHaveCount(0);

  await page
    .getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput)
    .fill(standaloneUpdatedName);
  await page.getByTestId("save-trade-plan-name-button").click();
  await page
    .getByTestId("trade-plan-symbol-input")
    .fill(standaloneUpdatedSymbol);
  await page.getByTestId("save-trade-plan-symbol-button").click();
  await page.getByTestId("trade-plan-status-select").selectOption("active");
  await expect(page.getByTestId("trade-plan-status-select")).toHaveValue(
    "active",
  );

  const standaloneNoteRows = page.getByTestId(/^trade-plan-note-row-/);
  const initialStandaloneNoteCount = await standaloneNoteRows.count();

  await page.getByTestId("trade-plan-add-note-textarea").fill(standaloneNote);
  await page.getByTestId("trade-plan-add-note-button").click();

  await expect(standaloneNoteRows).toHaveCount(initialStandaloneNoteCount + 1);
  const standaloneNoteRow = standaloneNoteRows.nth(initialStandaloneNoteCount);
  const standaloneNoteRowTestId =
    await standaloneNoteRow.getAttribute("data-testid");

  if (!standaloneNoteRowTestId) {
    throw new Error(
      "Expected data-testid on newly created trade plan note row.",
    );
  }

  const standaloneNoteId = standaloneNoteRowTestId.replace(
    "trade-plan-note-row-",
    "",
  );

  await page
    .getByTestId(`trade-plan-edit-note-button-${standaloneNoteId}`)
    .click();
  await page
    .getByTestId(`trade-plan-edit-note-textarea-${standaloneNoteId}`)
    .fill(updatedStandaloneNote);
  await page
    .getByTestId(`trade-plan-save-note-button-${standaloneNoteId}`)
    .click();
  await expect(
    page.getByTestId(`trade-plan-note-content-${standaloneNoteId}`),
  ).toContainText(updatedStandaloneNote);

  const standalonePlanId = page.url().match(/\/trade-plans\/([^/]+)$/)?.[1];
  if (!standalonePlanId) {
    throw new Error("Expected standalone trade plan id in detail route.");
  }

  await page.goto("/campaigns/new");
  await getNameInput(page).fill(linkedCampaignName);
  await getThesisTextarea(page).fill(`Linked thesis ${timestamp}`);
  await getCreateCampaignButton(page).click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);

  await page.getByTestId("add-trade-plan-button").click();
  await getNameInput(page).fill(linkedPlanName);
  await getInstrumentSymbolInput(page).fill("INTC");
  await getCreateLinkedTradePlanButton(page).click();

  const linkedTradePlanId =
    await getOnlyLinkedTradePlanIdFromCampaignDetail(page);
  const linkedPlanLink = page.getByTestId(
    getTradePlanLinkTestId(linkedTradePlanId),
  );
  await expect(linkedPlanLink).toBeVisible();
  await linkedPlanLink.click();

  await expect(page.getByTestId("trade-plan-relationship-label")).toContainText(
    "Linked",
  );
  await expect(page.getByTestId("trade-plan-campaign-link")).toContainText(
    linkedCampaignName,
  );

  await page
    .getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput)
    .fill(linkedUpdatedName);
  await page.getByTestId("save-trade-plan-name-button").click();
  await page.getByTestId("trade-plan-symbol-input").fill(linkedUpdatedSymbol);
  await page.getByTestId("save-trade-plan-symbol-button").click();
  await expect(page.getByTestId("trade-plan-campaign-link")).toContainText(
    linkedCampaignName,
  );

  await expect(page.getByTestId("trade-plan-status-select")).toHaveValue(
    "idea",
  );
});

test("trade plan detail accepts seeded inbox trades locally", async ({
  page,
}) => {
  const configuredBaseUrl = getConfiguredBaseUrl();

  test.skip(
    !configuredBaseUrl || !isLocalPlaywrightTarget(configuredBaseUrl),
    "Deterministic inbox acceptance seeding is only available against local Convex targets.",
  );

  const timestamp = Date.now();
  const standalonePlanName = `E2E Inbox Standalone Plan ${timestamp}`;
  const standaloneUpdatedSymbol = "ETH";
  const linkedCampaignName = `E2E Inbox Campaign ${timestamp}`;
  const linkedPlanName = `E2E Inbox Linked Plan ${timestamp}`;
  const linkedUpdatedSymbol = "AMD";

  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);

  await getNameInput(page).fill(standalonePlanName);
  await getInstrumentSymbolInput(page).fill("SOL");
  const inboxTradePlanLinks = page.getByTestId(/^trade-plan-link-/);
  const initialInboxStandaloneHrefs = new Set(
    (await inboxTradePlanLinks.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("href")).filter(Boolean),
    )) as string[],
  );
  await getCreateTradePlanButton(page).click();

  const standaloneTradePlanId = await getNewTradePlanIdFromListPage(
    page,
    initialInboxStandaloneHrefs,
  );
  await page.getByTestId(getTradePlanLinkTestId(standaloneTradePlanId)).click();
  await page
    .getByTestId("trade-plan-symbol-input")
    .fill(standaloneUpdatedSymbol);
  await page.getByTestId("save-trade-plan-symbol-button").click();

  const standalonePlanId = page.url().match(/\/trade-plans\/([^/]+)$/)?.[1];
  if (!standalonePlanId) {
    throw new Error("Expected standalone trade plan id in detail route.");
  }

  await page.goto("/campaigns/new");
  await getNameInput(page).fill(linkedCampaignName);
  await getThesisTextarea(page).fill(`Inbox linked thesis ${timestamp}`);
  await getCreateCampaignButton(page).click();

  await page.getByTestId("add-trade-plan-button").click();
  await getNameInput(page).fill(linkedPlanName);
  await getInstrumentSymbolInput(page).fill("INTC");
  await getCreateLinkedTradePlanButton(page).click();
  const linkedPlanId = await getOnlyLinkedTradePlanIdFromCampaignDetail(page);
  await page.getByTestId(getTradePlanLinkTestId(linkedPlanId)).click();
  await page.getByTestId("trade-plan-symbol-input").fill(linkedUpdatedSymbol);
  await page.getByTestId("save-trade-plan-symbol-button").click();

  const linkedPlanIdFromUrl = page.url().match(/\/trade-plans\/([^/]+)$/)?.[1];
  if (!linkedPlanIdFromUrl) {
    throw new Error("Expected linked trade plan id in detail route.");
  }

  const scope = `trade-plan-workspace-${timestamp}`;
  const inboxScenario = runConvexFunction<{
    linkedSuggestedExternalId: string;
    standaloneAssignedExternalId: string;
  }>("e2eSeed:seedTradePlanInboxScenarios", {
    linkedTradePlanId: linkedPlanIdFromUrl,
    scope,
    standaloneTradePlanId: standalonePlanId,
  });

  await page.reload();
  const linkedInboxRow = page.getByTestId(
    getInboxTradeRowTestId(
      linkedUpdatedSymbol,
      inboxScenario.linkedSuggestedExternalId,
    ),
  );
  await expect(linkedInboxRow).toBeVisible();
  await page
    .getByTestId(
      getInboxTradeAcceptButtonTestId(
        linkedUpdatedSymbol,
        inboxScenario.linkedSuggestedExternalId,
      ),
    )
    .click();
  await expect(linkedInboxRow).toHaveCount(0);
  await expect(
    page.getByTestId(
      getTradeRowTestId(
        linkedUpdatedSymbol,
        E2E_SMOKE_FIXTURES.inboxTrades.linkedSuggested.date,
      ),
    ),
  ).toBeVisible();

  await page.goto(`/trade-plans/${standalonePlanId}`);
  await expect(page.getByTestId("trade-plan-relationship-label")).toContainText(
    "Standalone",
  );
  const standaloneInboxRow = page.getByTestId(
    getInboxTradeRowTestId(
      standaloneUpdatedSymbol,
      inboxScenario.standaloneAssignedExternalId,
    ),
  );
  await expect(standaloneInboxRow).toBeVisible();
  await page
    .getByTestId(
      getInboxTradeAcceptButtonTestId(
        standaloneUpdatedSymbol,
        inboxScenario.standaloneAssignedExternalId,
      ),
    )
    .click();
  await expect(standaloneInboxRow).toHaveCount(0);
  await expect(
    page.getByTestId(
      getTradeRowTestId(
        standaloneUpdatedSymbol,
        E2E_SMOKE_FIXTURES.inboxTrades.standaloneAssigned.date,
      ),
    ),
  ).toBeVisible();
});
