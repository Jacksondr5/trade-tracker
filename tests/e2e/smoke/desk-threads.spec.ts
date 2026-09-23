import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getAnyElementRow,
  getAnyEpisodeCard,
  getElementKindInput,
  getEpisodeAddElementToggle,
  getElementStatementInput,
  getElementStatusSelect,
  getElementSubmitButton,
  getPageTitle,
  getThreadOpenEpisodeButton,
  getThreadOpenSubmitButton,
  getThreadOpenTickerInput,
  readEpisodeIdFromCard,
} from "../helpers/selectors";

const OPEN_THREAD_TICKER = "E2ETHRD";

test("desk page renders its title", async ({ page }) => {
  await page.goto("/desk");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.desk);
  await expect(getPageTitle(page, "desk")).toBeVisible();
});

test("threads page renders its title", async ({ page }) => {
  await page.goto("/threads");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.threads);
  await expect(getPageTitle(page, "threads")).toBeVisible();
});

test("open thread, start an episode, and add an element", async ({ page }) => {
  await page.goto("/threads");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.threads);

  await getThreadOpenTickerInput(page).fill(OPEN_THREAD_TICKER);
  await getThreadOpenSubmitButton(page).click();

  await page.waitForURL(new RegExp(`/threads/${OPEN_THREAD_TICKER}$`));
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.thread);
  await expect(getPageTitle(page, "thread")).toHaveText(OPEN_THREAD_TICKER);

  await getThreadOpenEpisodeButton(page).click();
  const card = getAnyEpisodeCard(page).first();
  await expect(card).toBeVisible();
  const episodeId = await readEpisodeIdFromCard(card);

  await getEpisodeAddElementToggle(page, episodeId).click();
  await getElementStatementInput(page, episodeId).fill("Enter on a breakout");
  await getElementStatusSelect(page, episodeId).selectOption("agreed");
  await getElementKindInput(page, episodeId).fill("entry");
  await getElementSubmitButton(page, episodeId).click();

  await expect(getAnyElementRow(page).first()).toBeVisible();
});
