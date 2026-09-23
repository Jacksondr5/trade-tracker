import { expect, test } from "@playwright/test";
import { E2E_SMOKE_FIXTURES } from "../../../shared/e2e/smokeFixtures";
import { waitForAuthenticatedApp } from "../helpers/app";
import {
  APP_PAGE_TITLES,
  getAnyDeskCampaignGroup,
  getAnyEpisodeCard,
  getPageTitle,
  getThreadRow,
} from "../helpers/selectors";

const fixture = E2E_SMOKE_FIXTURES.instrumentThread;

test("seeded campaign episode renders on the desk and its thread page", async ({
  page,
}) => {
  await page.goto("/desk");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.desk);
  await expect(getAnyDeskCampaignGroup(page).first()).toBeVisible();

  await page.goto("/threads");
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.threads);
  await expect(getThreadRow(page, fixture.ticker)).toBeVisible();

  await page.goto(`/threads/${fixture.ticker}`);
  await waitForAuthenticatedApp(page, APP_PAGE_TITLES.thread);
  await expect(getPageTitle(page, "thread")).toHaveText(fixture.ticker);
  await expect(getAnyEpisodeCard(page).first()).toBeVisible();
});
