import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import { runConvexFunction } from "../helpers/convex";
import { getConfiguredBaseUrl, isLocalPlaywrightTarget } from "../helpers/env";
import {
  APP_PAGE_TITLES,
  getElementKindInput,
  getElementRow,
  getElementStatementInput,
  getElementStatusSelect,
  getElementSubmitButton,
  getEpisodeAddElementToggle,
  getEpisodeCard,
  getPageTitle,
  getThreadOpenEpisodeButton,
  getThreadOpenSubmitButton,
  getThreadOpenTickerInput,
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
  const configuredBaseUrl = getConfiguredBaseUrl();
  test.skip(
    !configuredBaseUrl || !isLocalPlaywrightTarget(configuredBaseUrl),
    "Fixture ids are read from Convex directly, which is only available against local Convex targets.",
  );

  await page.goto("/threads");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.threads);

  await getThreadOpenTickerInput(page).fill(OPEN_THREAD_TICKER);
  await getThreadOpenSubmitButton(page).click();

  await page.waitForURL(new RegExp(`/threads/${OPEN_THREAD_TICKER}$`));
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.thread);
  await expect(getPageTitle(page, "thread")).toHaveText(OPEN_THREAD_TICKER);

  await getThreadOpenEpisodeButton(page).click();
  await expect
    .poll(
      () =>
        runConvexFunction<{ episodeIds: string[] }>(
          "e2eSeed:getThreadEpisodeIds",
          { ticker: OPEN_THREAD_TICKER },
        ).episodeIds.length,
    )
    .toBe(1);
  const { episodeIds } = runConvexFunction<{ episodeIds: string[] }>(
    "e2eSeed:getThreadEpisodeIds",
    { ticker: OPEN_THREAD_TICKER },
  );
  const [episodeId] = episodeIds;
  if (!episodeId) throw new Error("Expected one episode on the new thread");
  await expect(getEpisodeCard(page, episodeId)).toBeVisible();

  await getEpisodeAddElementToggle(page, episodeId).click();
  await getElementStatementInput(page, episodeId).fill("Enter on a breakout");
  await getElementStatusSelect(page, episodeId).selectOption("agreed");
  await getElementKindInput(page, episodeId).fill("entry");
  await getElementSubmitButton(page, episodeId).click();

  await expect
    .poll(
      () =>
        runConvexFunction<{ elementIds: string[] }>(
          "e2eSeed:getEpisodeElementIds",
          { episodeId },
        ).elementIds.length,
    )
    .toBe(1);
  const { elementIds } = runConvexFunction<{ elementIds: string[] }>(
    "e2eSeed:getEpisodeElementIds",
    { episodeId },
  );
  const [elementId] = elementIds;
  if (!elementId) throw new Error("Expected one element on the new episode");
  await expect(getElementRow(page, elementId)).toBeVisible();
});
