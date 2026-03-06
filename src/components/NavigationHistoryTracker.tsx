"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export const NAVIGATION_CURRENT_ROUTE_KEY = "trade-tracker:nav-current-route";
export const NAVIGATION_PREVIOUS_ROUTE_KEY = "trade-tracker:nav-previous-route";

function toRelativeUrl(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

export function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitializedRef = useRef(false);

  const search = searchParams.toString();
  const currentRoute = search ? `${pathname}?${search}` : pathname;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const navigationEntry = window.performance
      .getEntriesByType("navigation")
      .at(0) as PerformanceNavigationTiming | undefined;
    const currentRouteFromStorage = window.sessionStorage.getItem(
      NAVIGATION_CURRENT_ROUTE_KEY,
    );
    const previousRouteFromStorage = window.sessionStorage.getItem(
      NAVIGATION_PREVIOUS_ROUTE_KEY,
    );

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;

      if (
        navigationEntry?.type === "reload" &&
        currentRouteFromStorage === currentRoute &&
        previousRouteFromStorage
      ) {
        return;
      }

      let previousRoute: string | null = null;

      if (document.referrer) {
        try {
          const referrerUrl = new URL(document.referrer);

          if (referrerUrl.origin === window.location.origin) {
            const referrerRoute = toRelativeUrl(referrerUrl);
            if (referrerRoute !== currentRoute) {
              previousRoute = referrerRoute;
            }
          }
        } catch {
          previousRoute = null;
        }
      }

      if (previousRoute) {
        window.sessionStorage.setItem(
          NAVIGATION_PREVIOUS_ROUTE_KEY,
          previousRoute,
        );
      } else {
        window.sessionStorage.removeItem(NAVIGATION_PREVIOUS_ROUTE_KEY);
      }

      window.sessionStorage.setItem(NAVIGATION_CURRENT_ROUTE_KEY, currentRoute);
      return;
    }

    if (currentRouteFromStorage === currentRoute) {
      return;
    }

    if (currentRouteFromStorage) {
      window.sessionStorage.setItem(
        NAVIGATION_PREVIOUS_ROUTE_KEY,
        currentRouteFromStorage,
      );
    } else {
      window.sessionStorage.removeItem(NAVIGATION_PREVIOUS_ROUTE_KEY);
    }

    window.sessionStorage.setItem(NAVIGATION_CURRENT_ROUTE_KEY, currentRoute);
  }, [currentRoute]);

  return null;
}
