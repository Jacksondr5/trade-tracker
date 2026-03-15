import {
  NAVIGATION_SECTION_TEST_IDS,
  NAVIGATION_TEST_IDS,
} from "../../../shared/e2e/testIds";
import type { LucideIcon } from "lucide-react";
import {
  ChartCandlestick,
  FolderKanban,
  GalleryVerticalEnd,
  Import as ImportIcon,
  LayoutDashboard,
  Map,
  NotebookPen,
  NotepadText,
  SquareChartGantt,
  Wallet,
} from "lucide-react";

export interface AppNavigationItem {
  href: string;
  icon: LucideIcon;
  label: string;
  matchPrefixes: string[];
  testId: string;
}

export interface AppNavigationSection {
  items: AppNavigationItem[];
  testId: string;
  title: string;
}

export const appNavigationSections: AppNavigationSection[] = [
  {
    testId: NAVIGATION_SECTION_TEST_IDS.activity,
    title: "Activity",
    items: [
      {
        href: "/dashboard",
        icon: LayoutDashboard,
        label: "Dashboard",
        testId: NAVIGATION_TEST_IDS.dashboard,
        matchPrefixes: ["/dashboard"],
      },
      {
        href: "/trades",
        icon: ChartCandlestick,
        label: "Trades",
        matchPrefixes: ["/trades"],
        testId: NAVIGATION_TEST_IDS.trades,
      },
      {
        href: "/campaigns",
        icon: Map,
        label: "Campaigns",
        testId: NAVIGATION_TEST_IDS.campaigns,
        matchPrefixes: ["/campaigns"],
      },
      {
        href: "/trade-plans",
        icon: SquareChartGantt,
        label: "Trade Plans",
        matchPrefixes: ["/trade-plans"],
        testId: NAVIGATION_TEST_IDS.tradePlans,
      },
    ],
  },
  {
    testId: NAVIGATION_SECTION_TEST_IDS.review,
    title: "Review",
    items: [
      {
        href: "/positions",
        icon: GalleryVerticalEnd,
        label: "Positions",
        matchPrefixes: ["/positions"],
        testId: NAVIGATION_TEST_IDS.positions,
      },
      {
        href: "/portfolios",
        icon: FolderKanban,
        label: "Portfolios",
        matchPrefixes: ["/portfolios", "/portfolio"],
        testId: NAVIGATION_TEST_IDS.portfolios,
      },
      {
        href: "/imports",
        icon: ImportIcon,
        label: "Imports",
        matchPrefixes: ["/imports"],
        testId: NAVIGATION_TEST_IDS.imports,
      },
    ],
  },
  {
    testId: NAVIGATION_SECTION_TEST_IDS.writing,
    title: "Writing",
    items: [
      {
        href: "/notes",
        icon: NotebookPen,
        label: "Notes",
        matchPrefixes: ["/notes"],
        testId: NAVIGATION_TEST_IDS.notes,
      },
      {
        href: "/strategy",
        icon: NotepadText,
        label: "Strategy",
        matchPrefixes: ["/strategy"],
        testId: NAVIGATION_TEST_IDS.strategy,
      },
    ],
  },
  {
    testId: NAVIGATION_SECTION_TEST_IDS.settings,
    title: "Settings",
    items: [
      {
        href: "/accounts",
        icon: Wallet,
        label: "Accounts",
        matchPrefixes: ["/accounts"],
        testId: NAVIGATION_TEST_IDS.accounts,
      },
    ],
  },
];

export function isAppNavigationItemActive(
  pathname: string,
  item: AppNavigationItem,
): boolean {
  return item.matchPrefixes.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function getActiveAppNavigationItem(pathname: string) {
  return appNavigationSections
    .flatMap((section) => section.items)
    .find((item) => isAppNavigationItemActive(pathname, item));
}
