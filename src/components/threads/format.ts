import { ConvexError } from "convex/values";
import type { BadgeProps } from "~/components/ui";
import { formatCurrency } from "~/lib/format";
import type { ElementValue, ElementView, EpisodePosition } from "./types";

type Lifecycle = "idea" | "watching" | "active" | "closed";

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  idea: "Idea",
  watching: "Watching",
  active: "Active",
  closed: "Closed",
};

export function lifecycleBadgeVariant(
  lifecycle: Lifecycle,
): BadgeProps["variant"] {
  switch (lifecycle) {
    case "active":
      return "success";
    case "watching":
      return "warning";
    default:
      return "neutral";
  }
}

export const ELEMENT_STATUS_LABELS: Record<ElementView["status"], string> = {
  proposed: "Proposed",
  agreed: "Agreed",
  superseded: "Superseded",
  dropped: "Dropped",
};

export function elementStatusBadgeVariant(
  status: ElementView["status"],
): BadgeProps["variant"] {
  switch (status) {
    case "agreed":
      return "success";
    case "proposed":
      return "warning";
    default:
      return "neutral";
  }
}

export const ELEMENT_AUTHOR_LABELS: Record<ElementView["author"], string> = {
  user: "User",
  counterpart: "Counterpart",
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
});

export function formatElementValue(value: ElementValue): string {
  let amount: string;
  switch (value.unit) {
    case "usd":
      amount = formatCurrency(value.amount);
      break;
    case "shares":
      amount = `${numberFormatter.format(value.amount)} sh`;
      break;
    case "percent":
      amount = `${numberFormatter.format(value.amount)}%`;
      break;
    case "ratio":
      amount = `${numberFormatter.format(value.amount)}x`;
      break;
  }
  const scope =
    value.scope === "per_share"
      ? "per share"
      : value.scope === "portfolio"
        ? "portfolio"
        : "position";
  const provenance =
    value.provenance === "hypothetical"
      ? "hypothetical"
      : value.provenance === "user_reported"
        ? "reported"
        : "verified";
  const stopKind =
    value.stopKind === "broker_order"
      ? ", broker order"
      : value.stopKind === "planned_exit"
        ? ", planned exit"
        : "";
  return `${amount} (${scope}, ${provenance}${stopKind})`;
}

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
  style: "currency",
});

/** Number only, no scope or provenance: "$240", "17 sh", "3%", "2.16x". */
export function formatCompactValue(value: ElementValue): string {
  switch (value.unit) {
    case "usd":
      return compactUsdFormatter.format(value.amount);
    case "shares":
      return `${numberFormatter.format(value.amount)} sh`;
    case "percent":
      return `${numberFormatter.format(value.amount)}%`;
    case "ratio":
      return `${numberFormatter.format(value.amount)}x`;
  }
}

export function formatPosition(position: EpisodePosition): string {
  if (!position) return "Flat";
  return `${numberFormatter.format(position.netQuantity)} @ ${formatCurrency(position.averageCost)}`;
}

export function formatAsOf(asOf: string): string {
  return `as of ${asOf}`;
}

export function getMutationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string") return data;
    if (
      data &&
      typeof data === "object" &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return data.message;
    }
    return fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
