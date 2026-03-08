import type { InboxTrade } from "./types";

export { formatCurrency, formatDate } from "~/lib/format";

export function toDateTimeLocalValue(timestamp?: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function isTradeReadyForAcceptance(trade: InboxTrade): boolean {
  return !!(
    trade.ticker &&
    trade.assetType &&
    trade.side &&
    trade.direction &&
    trade.date !== undefined &&
    Number.isFinite(trade.date) &&
    trade.price !== undefined &&
    Number.isFinite(trade.price) &&
    trade.price > 0 &&
    trade.quantity !== undefined &&
    Number.isFinite(trade.quantity) &&
    trade.quantity > 0
  );
}
