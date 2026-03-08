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
        href: "/",
        icon: LayoutDashboard,
        label: "Dashboard",
        matchPrefixes: ["/"],
      },
      {
        href: "/trades",
        icon: ChartCandlestick,
        label: "Trades",
        matchPrefixes: ["/trades"],
      },
      {
        href: "/campaigns",
        icon: Map,
        label: "Campaigns",
        matchPrefixes: ["/campaigns"],
      },
      {
        href: "/trade-plans",
        icon: SquareChartGantt,
        label: "Trade Plans",
        matchPrefixes: ["/trade-plans"],
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
      },
      {
        href: "/portfolios",
        icon: FolderKanban,
        label: "Portfolios",
        matchPrefixes: ["/portfolios", "/portfolio"],
      },
      {
        href: "/imports",
        icon: ImportIcon,
        label: "Imports",
        matchPrefixes: ["/imports"],
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
      },
      {
        href: "/strategy",
        icon: NotepadText,
        label: "Strategy",
        matchPrefixes: ["/strategy"],
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
      },
    ],
  },
];

export function isAppNavigationItemActive(
  pathname: string,
  item: AppNavigationItem,
): boolean {
  return item.matchPrefixes.some((prefix) => {
    if (prefix === "/") {
      return pathname === "/";
    }

    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
}

export function getActiveAppNavigationItem(pathname: string) {
  return appNavigationSections
    .flatMap((section) => section.items)
    .find((item) => isAppNavigationItemActive(pathname, item));
}
