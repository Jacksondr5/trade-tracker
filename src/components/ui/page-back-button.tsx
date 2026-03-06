"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NAVIGATION_PREVIOUS_ROUTE_KEY } from "~/components/NavigationHistoryTracker";
import { Button } from "./button";

interface PageBackButtonProps {
  dataTestId: string;
  fallbackHref: string;
  label: string;
}

function getPathname(route: string) {
  return route.split("?")[0]?.split("#")[0] ?? route;
}

function getBackLabel(previousRoute: string | null, fallbackLabel: string) {
  if (!previousRoute) {
    return fallbackLabel;
  }

  const pathname = getPathname(previousRoute);

  if (pathname === "/campaigns") {
    return "Back to Campaigns";
  }

  if (pathname.startsWith("/campaigns/") && pathname !== "/campaigns/new") {
    return "Back to Campaign";
  }

  if (pathname === "/trade-plans") {
    return "Back to Trade Plans";
  }

  if (pathname.startsWith("/trade-plans/")) {
    return "Back to Trade Plan";
  }

  if (pathname === "/portfolio") {
    return "Back to Portfolios";
  }

  if (pathname.startsWith("/portfolio/")) {
    return "Back to Portfolio";
  }

  return fallbackLabel;
}

function PageBackButton({
  dataTestId,
  fallbackHref,
  label,
}: PageBackButtonProps) {
  const router = useRouter();
  const [buttonLabel, setButtonLabel] = useState(label);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const previousRoute = window.sessionStorage.getItem(
      NAVIGATION_PREVIOUS_ROUTE_KEY,
    );

    setButtonLabel(getBackLabel(previousRoute, label));
  }, [label]);

  const handleClick = () => {
    if (typeof window === "undefined") {
      router.push(fallbackHref);
      return;
    }

    const previousRoute = window.sessionStorage.getItem(
      NAVIGATION_PREVIOUS_ROUTE_KEY,
    );

    if (previousRoute) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      dataTestId={dataTestId}
      onClick={handleClick}
      aria-label={buttonLabel}
      className="mb-2 -ml-3 text-sm text-slate-11 hover:text-slate-12"
    >
      <ChevronLeft className="size-4" />
      {buttonLabel}
    </Button>
  );
}

export { PageBackButton };
