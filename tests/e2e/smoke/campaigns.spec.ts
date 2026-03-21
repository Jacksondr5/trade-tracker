import { expect, test } from "@playwright/test";
import {
  APP_SHELL_TEST_IDS,
  getTradePlanLinkTestId,
  getNoteComposerTextareaTestId,
  getNoteComposerSubmitButtonTestId,
  getNoteContentTestId,
  getEditNoteButtonTestId,
  getEditNoteTextareaTestId,
  getSaveNoteButtonTestId,
} from "../../../shared/e2e/testIds";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getCampaignRow,
  getCampaignRowByName,
  getCampaignStatusSelect,
  getCreateCampaignButton,
  getCreateLinkedTradePlanButton,
  getInstrumentSymbolInput,
  getNameInput,
  getNewCampaignPageTitle,
  getOnlyLinkedTradePlanIdFromCampaignDetail,
  getRetrospectiveSection,
  getRetrospectiveTextarea,
  getSaveRetrospectiveButton,
  getThesisTextarea,
} from "../helpers/selectors";

test("seeded campaign is visible and detail page loads", async ({ page }) => {
  await page.goto("/campaigns");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.campaigns);

  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.campaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.planningCampaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.closedCampaign.name),
  ).toBeVisible();

  await page.getByTestId("status-filter-planning").click();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.planningCampaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.campaign.name),
  ).toHaveCount(0);
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.closedCampaign.name),
  ).toHaveCount(0);

  await page.getByTestId("status-filter-closed").click();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.closedCampaign.name),
  ).toBeVisible();
  await expect(
    getCampaignRowByName(page, E2E_SMOKE_FIXTURES.planningCampaign.name),
  ).toHaveCount(0);

  await page.getByTestId("status-filter-all").click();
  await expect(getCampaignRow(page)).toBeVisible();
  await getCampaignRow(page).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(getCampaignStatusSelect(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.campaign.status,
  );
  await page.getByTestId(APP_SHELL_TEST_IDS.editCampaignName).click();
  await expect(getNameInput(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.campaign.name,
  );
  await page.getByTestId("edit-thesis").click();
  await expect(getThesisTextarea(page)).toHaveValue(
    E2E_SMOKE_FIXTURES.campaign.thesis,
  );
});

test("campaign lifecycle supports detail mutation, linked trade plan creation, and retrospective workflow", async ({
  page,
}) => {
  const timestamp = Date.now();
  const createdCampaignName = `E2E Campaign Lifecycle ${timestamp}`;
  const updatedCampaignName = `${createdCampaignName} Updated`;
  const createdLinkedPlanName = `E2E Linked Plan ${timestamp}`;
  const campaignNote = `Campaign note ${timestamp}`;
  const updatedCampaignNote = `${campaignNote} edited`;
  const updatedThesis = `Updated campaign thesis ${timestamp}`;
  const retrospective = `Retrospective ${timestamp}`;

  await page.goto("/campaigns/new");
  await expect(getNewCampaignPageTitle(page)).toBeVisible();
  await getNameInput(page).fill(createdCampaignName);
  await getThesisTextarea(page).fill(`Initial thesis ${timestamp}`);
  await getCreateCampaignButton(page).click();

  await expect(page).toHaveURL(/\/campaigns\/[^/]+$/);
  await expect(page.getByTestId("campaign-status-select")).toHaveValue(
    "planning",
  );
  await expect(getRetrospectiveTextarea(page, "campaign")).toHaveCount(0);

  await page.getByTestId(APP_SHELL_TEST_IDS.editCampaignName).click();
  await getNameInput(page).fill(updatedCampaignName);
  await page.getByTestId("save-campaign-name-button").click();
  await expect(
    page.getByTestId(APP_SHELL_TEST_IDS.editCampaignName),
  ).toBeVisible();
  await page.getByTestId(APP_SHELL_TEST_IDS.editCampaignName).click();
  await expect(getNameInput(page)).toHaveValue(updatedCampaignName);
  await page.getByTestId("cancel-edit-campaign-name").click();

  await page.getByTestId("edit-thesis").click();
  await getThesisTextarea(page).fill(updatedThesis);
  await page.getByTestId("save-campaign-thesis-button").click();
  await expect(page.getByTestId("edit-thesis")).toBeVisible();
  await page.getByTestId("edit-thesis").click();
  await expect(getThesisTextarea(page)).toHaveValue(updatedThesis);
  await page.getByTestId("cancel-edit-thesis").click();

  await page
    .getByTestId(getNoteComposerTextareaTestId("campaign"))
    .fill(campaignNote);
  await page.getByTestId(getNoteComposerSubmitButtonTestId("campaign")).click();
  const campaignNoteRows = page.getByTestId(/^campaign-note-row-/);
  await expect(campaignNoteRows).toHaveCount(1);
  const campaignNoteRow = campaignNoteRows.first();
  const campaignNoteRowTestId =
    await campaignNoteRow.getAttribute("data-testid");
  if (!campaignNoteRowTestId) {
    throw new Error("Expected data-testid on campaign note row.");
  }
  const campaignNoteId = campaignNoteRowTestId.replace(
    "campaign-note-row-",
    "",
  );
  await expect(
    campaignNoteRow.getByTestId(
      getNoteContentTestId("campaign", campaignNoteId),
    ),
  ).toContainText(campaignNote);
  await campaignNoteRow
    .getByTestId(getEditNoteButtonTestId("campaign", campaignNoteId))
    .click();
  await campaignNoteRow
    .getByTestId(getEditNoteTextareaTestId("campaign", campaignNoteId))
    .fill(updatedCampaignNote);
  await campaignNoteRow
    .getByTestId(getSaveNoteButtonTestId("campaign", campaignNoteId))
    .click();
  await expect(
    campaignNoteRow.getByTestId(
      getNoteContentTestId("campaign", campaignNoteId),
    ),
  ).toContainText(updatedCampaignNote);

  await page.getByTestId("add-trade-plan-button").click();
  await getNameInput(page).fill(createdLinkedPlanName);
  await getInstrumentSymbolInput(page).fill("NVDA");
  await getCreateLinkedTradePlanButton(page).click();

  const linkedTradePlanId =
    await getOnlyLinkedTradePlanIdFromCampaignDetail(page);
  const linkedTradePlanLink = page.getByTestId(
    getTradePlanLinkTestId(linkedTradePlanId),
  );
  await expect(linkedTradePlanLink).toBeVisible();
  const linkedTradePlanHref = await linkedTradePlanLink.getAttribute("href");
  const linkedTradePlanIdFromHref = linkedTradePlanHref?.match(
    /\/trade-plans\/([^/]+)$/,
  )?.[1];

  if (linkedTradePlanIdFromHref !== linkedTradePlanId) {
    throw new Error("Expected linked trade plan id in campaign detail link.");
  }
  await expect(
    page.getByTestId(`linked-trade-plan-status-${linkedTradePlanId}`),
  ).toHaveValue("idea");
  await page
    .getByTestId(`linked-trade-plan-status-${linkedTradePlanId}`)
    .selectOption("active");
  await expect(
    page.getByTestId(`linked-trade-plan-status-${linkedTradePlanId}`),
  ).toHaveValue("active");

  await getCampaignStatusSelect(page).selectOption("closed");
  await expect(getCampaignStatusSelect(page)).toHaveValue("closed");
  await expect(getRetrospectiveTextarea(page, "campaign")).toBeVisible();

  await page
    .getByTestId(`linked-trade-plan-status-${linkedTradePlanId}`)
    .selectOption("closed");
  await expect(
    page.getByTestId(`linked-trade-plan-status-${linkedTradePlanId}`),
  ).toHaveValue("closed");

  await getRetrospectiveTextarea(page, "campaign").fill(retrospective);
  await getSaveRetrospectiveButton(page, "campaign").click();

  await page.reload();
  await expect(getCampaignStatusSelect(page)).toHaveValue("closed");
  // After save + reload, content is in read mode — verify text is visible
  await expect(getRetrospectiveSection(page, "campaign")).toContainText(
    retrospective,
  );
  await expect(linkedTradePlanLink).toBeVisible();
});
