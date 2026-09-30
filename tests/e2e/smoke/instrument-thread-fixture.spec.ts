import { expect, test } from "@playwright/test";
import { waitForAuthenticatedApp } from "../helpers/app";
import { runConvexFunction } from "../helpers/convex";
import { getConfiguredBaseUrl, isLocalPlaywrightTarget } from "../helpers/env";
import {
  APP_PAGE_TITLES,
  getDeskCampaignGroup,
  getDeskEpisodeRow,
  getEpisodeCard,
  getEpisodeCheckpoint,
  getEpisodeSinceCheckpoint,
  getPageTitle,
  getThreadRow,
} from "../helpers/selectors";

type InstrumentThreadFixtureIds = {
  campaignId: string;
  checkpointVersionNumber: number;
  closedEpisodeId: string;
  liveEpisodeId: string;
  ticker: string;
};

test("seeded campaign episode renders on the desk and its thread page", async ({
  page,
}) => {
  const configuredBaseUrl = getConfiguredBaseUrl();
  test.skip(
    !configuredBaseUrl || !isLocalPlaywrightTarget(configuredBaseUrl),
    "Fixture ids are read from Convex directly, which is only available against local Convex targets.",
  );

  const fixture = runConvexFunction<InstrumentThreadFixtureIds>(
    "e2eSeed:getInstrumentThreadFixtureIds",
    {},
  );

  await page.goto("/desk");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.desk);
  const group = getDeskCampaignGroup(page, fixture.campaignId);
  await expect(group).toBeVisible();
  await expect(getDeskEpisodeRow(page, fixture.liveEpisodeId)).toBeVisible();
  await expect(
    group.locator(getDeskEpisodeRow(page, fixture.liveEpisodeId)),
  ).toBeVisible();

  await page.goto("/threads");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.threads);
  await expect(getThreadRow(page, fixture.ticker)).toBeVisible();

  await page.goto(`/threads/${fixture.ticker}`);
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.thread);
  await expect(getPageTitle(page, "thread")).toHaveText(fixture.ticker);
  await expect(getEpisodeCard(page, fixture.liveEpisodeId)).toBeVisible();
  await expect(getEpisodeCheckpoint(page, fixture.liveEpisodeId)).toBeVisible();
  await expect(
    getEpisodeSinceCheckpoint(page, fixture.liveEpisodeId),
  ).toBeVisible();
  await expect(getEpisodeCard(page, fixture.closedEpisodeId)).toBeVisible();
});
