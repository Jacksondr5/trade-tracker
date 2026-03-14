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
  title: string;
}

export const appNavigationSections: AppNavigationSection[] = [
  {
    title: "Activity",
    items: [
      {
        href: "/dashboard",
        icon: LayoutDashboard,
        label: "Dashboard",
        testId: "nav-dashboard-link",
        matchPrefixes: ["/dashboard"],
      },
      {
        href: "/trades",
        icon: ChartCandlestick,
        label: "Trades",
        matchPrefixes: ["/trades"],
        testId: "nav-trades-link",
      },
      {
        href: "/campaigns",
        icon: Map,
        label: "Campaigns",
        matchPrefixes: ["/campaigns"],
        testId: "nav-campaigns-link",
      },
      {
        href: "/trade-plans",
        icon: SquareChartGantt,
        label: "Trade Plans",
        matchPrefixes: ["/trade-plans"],
        testId: "nav-trade-plans-link",
      },
    ],
  },
  {
    title: "Review",
    items: [
      {
        href: "/positions",
        icon: GalleryVerticalEnd,
        label: "Positions",
        matchPrefixes: ["/positions"],
        testId: "nav-positions-link",
      },
      {
        href: "/portfolios",
        icon: FolderKanban,
        label: "Portfolios",
        matchPrefixes: ["/portfolios", "/portfolio"],
        testId: "nav-portfolios-link",
      },
      {
        href: "/imports",
        icon: ImportIcon,
        label: "Imports",
        matchPrefixes: ["/imports"],
        testId: "nav-imports-link",
      },
    ],
  },
  {
    title: "Writing",
    items: [
      {
        href: "/notes",
        icon: NotebookPen,
        label: "Notes",
        matchPrefixes: ["/notes"],
        testId: "nav-notes-link",
      },
      {
        href: "/strategy",
        icon: NotepadText,
        label: "Strategy",
        matchPrefixes: ["/strategy"],
        testId: "nav-strategy-link",
      },
    ],
  },
  {
    title: "Settings",
    items: [
      {
        href: "/accounts",
        icon: Wallet,
        label: "Accounts",
        matchPrefixes: ["/accounts"],
        testId: "nav-accounts-link",
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
