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
import {
  APP_PAGE_TITLES,
  getStandaloneTradePlanCard,
  getStandaloneTradePlanLink,
} from "../helpers/selectors";

test("seeded standalone trade plan and hierarchy render", async ({ page }) => {
  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);

  await expect(getStandaloneTradePlanLink(page)).toBeVisible();

  await getStandaloneTradePlanLink(page).click();

  await expect(page).toHaveURL(/\/trade-plans\/[^/]+$/);
  await expect(page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput)).toHaveValue(
    E2E_SMOKE_FIXTURES.standaloneTradePlan.name,
  );
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
  const createdTradePlanCard = getStandaloneTradePlanCard(page, createdPlanName);

  await page.goto("/trade-plans");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.tradePlans);
  const standaloneTradePlanCards = page.getByTestId(
    /^standalone-trade-plan-card-/,
  );
  const initialCardCount = await standaloneTradePlanCards.count();
  await expect(createdTradePlanCard).toHaveCount(0);

  await page.getByTestId("name-input").fill(createdPlanName);
  await page
    .getByTestId("instrumentSymbol-input")
    .fill(E2E_SMOKE_FIXTURES.createdStandaloneTradePlan.instrumentSymbol);
  await page.getByTestId("create-trade-plan-button").click();

  await expect(standaloneTradePlanCards).toHaveCount(initialCardCount + 1);
  await expect(createdTradePlanCard).toContainText(createdPlanName);
});

test("trade plan workspace covers standalone and linked detail flows plus inbox acceptance", async ({
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

  await page.getByTestId("name-input").fill(standalonePlanName);
  await page.getByTestId("instrumentSymbol-input").fill("SOL");
  await page.getByTestId("create-trade-plan-button").click();

  const createdStandalonePlanLink = page.getByTestId(
    getTradePlanLinkTestId(standalonePlanName),
  );
  await expect(createdStandalonePlanLink).toBeVisible();
  await createdStandalonePlanLink.click();

  await expect(page.getByTestId("trade-plan-relationship-label")).toContainText(
    "Standalone",
  );
  await expect(page.getByTestId("trade-plan-campaign-context")).toHaveCount(0);

  await page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput).fill(
    standaloneUpdatedName,
  );
  await page.getByTestId("save-trade-plan-name-button").click();
  await page.getByTestId("trade-plan-symbol-input").fill(standaloneUpdatedSymbol);
  await page.getByTestId("save-trade-plan-symbol-button").click();
  await page.getByTestId("trade-plan-status-select").selectOption("active");
  await expect(page.getByTestId("trade-plan-status-select")).toHaveValue("active");

  await page.getByTestId("trade-plan-add-note-textarea").fill(standaloneNote);
  await page.getByTestId("trade-plan-add-note-button").click();
  const standaloneNoteRows = page.getByTestId(/^trade-plan-note-row-/);
  await expect(standaloneNoteRows).toHaveCount(1);
  const standaloneNoteRow = standaloneNoteRows.first();
  await standaloneNoteRow.getByTestId(/^trade-plan-edit-note-button-/).click();
  await standaloneNoteRow
    .getByTestId(/^trade-plan-edit-note-textarea-/)
    .fill(updatedStandaloneNote);
  await standaloneNoteRow.getByTestId(/^trade-plan-save-note-button-/).click();
  await expect(
    standaloneNoteRow.getByTestId(/^trade-plan-note-content-/),
  ).toContainText(updatedStandaloneNote);

  const standalonePlanId = page.url().match(/\/trade-plans\/([^/]+)$/)?.[1];
  if (!standalonePlanId) {
    throw new Error("Expected standalone trade plan id in detail route.");
  }

  await page.goto("/campaigns/new");
  await page.getByTestId("name-input").fill(linkedCampaignName);
  await page.getByTestId("thesis-textarea").fill(`Linked thesis ${timestamp}`);
  await page.getByTestId("create-campaign-button").click();
  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);

  await page.getByTestId("add-trade-plan-button").click();
  await page.getByTestId("name-input").fill(linkedPlanName);
  await page.getByTestId("instrumentSymbol-input").fill("INTC");
  await page.getByTestId("create-linked-trade-plan-button").click();

  const linkedPlanLink = page.getByTestId(getTradePlanLinkTestId(linkedPlanName));
  await expect(linkedPlanLink).toBeVisible();
  await linkedPlanLink.click();

  await expect(page.getByTestId("trade-plan-relationship-label")).toContainText(
    "Linked",
  );
  await expect(page.getByTestId("trade-plan-campaign-link")).toContainText(
    linkedCampaignName,
  );

  await page.getByTestId(APP_SHELL_TEST_IDS.tradePlanNameInput).fill(
    linkedUpdatedName,
  );
  await page.getByTestId("save-trade-plan-name-button").click();
  await page.getByTestId("trade-plan-symbol-input").fill(linkedUpdatedSymbol);
  await page.getByTestId("save-trade-plan-symbol-button").click();
  await expect(page.getByTestId("trade-plan-campaign-link")).toContainText(
    linkedCampaignName,
  );

  const linkedPlanId = page.url().match(/\/trade-plans\/([^/]+)$/)?.[1];
  if (!linkedPlanId) {
    throw new Error("Expected linked trade plan id in detail route.");
  }

  const scope = `trade-plan-workspace-${timestamp}`;
  const inboxScenario = runConvexFunction<{
    linkedSuggestedExternalId: string;
    standaloneAssignedExternalId: string;
  }>("e2eSeed:seedTradePlanInboxScenarios", {
    linkedTradePlanId: linkedPlanId,
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
