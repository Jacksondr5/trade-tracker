"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MARKET_DATA_TABS_TEST_IDS } from "../../../../shared/e2e/testIds";
import { cn } from "~/lib/utils";

const TABS = [
  {
    href: "/market-data",
    label: "Symbol mappings",
    matchExact: true,
    testId: MARKET_DATA_TABS_TEST_IDS.mappings,
  },
  {
    href: "/market-data/health",
    label: "Health",
    matchExact: false,
    testId: MARKET_DATA_TABS_TEST_IDS.health,
  },
] as const;

export function MarketDataTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Market data sections"
      className="flex gap-1 border-b border-olive-6"
    >
      {TABS.map((tab) => {
        const isActive = tab.matchExact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-testid={tab.testId}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-blue-9 text-slate-12"
                : "border-transparent text-slate-11 hover:border-olive-7 hover:text-slate-12",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
