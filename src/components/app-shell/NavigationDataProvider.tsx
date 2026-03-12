"use client";

import { type Preloaded, usePreloadedQuery } from "convex/react";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { api } from "~/convex/_generated/api";
import type { CampaignTradePlanHierarchy } from "./campaign-trade-plan-hierarchy-state";
import {
  buildCommandPaletteSections,
  type CommandPaletteSections,
} from "./command-palette";

type NavigationDataContextValue = {
  commandPaletteSections: CommandPaletteSections;
  hierarchy: CampaignTradePlanHierarchy;
};

const NavigationDataContext = createContext<NavigationDataContextValue | null>(
  null,
);

export function NavigationDataProvider({
  children,
  preloadedHierarchy,
}: {
  children: ReactNode;
  preloadedHierarchy: Preloaded<typeof api.navigation.getCampaignTradePlanHierarchy>;
}) {
  const hierarchy = usePreloadedQuery(preloadedHierarchy);
  const commandPaletteSections = useMemo(
    () => buildCommandPaletteSections(hierarchy),
    [hierarchy],
  );

  return (
    <NavigationDataContext.Provider
      value={{
        commandPaletteSections,
        hierarchy,
      }}
    >
      {children}
    </NavigationDataContext.Provider>
  );
}

export function useNavigationData() {
  const context = useContext(NavigationDataContext);

  if (context === null) {
    throw new Error(
      "useNavigationData must be used within NavigationDataProvider.",
    );
  }

  return context;
}
