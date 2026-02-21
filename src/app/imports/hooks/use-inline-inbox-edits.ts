"use client";

import { useEffect, useState } from "react";
import type { InboxTrade } from "../types";

export function useInlineInboxEdits(inboxTrades: InboxTrade[] | undefined) {
  const [inlineNotes, setInlineNotes] = useState<Record<string, string>>({});
  const [inlineTradePlanIds, setInlineTradePlanIds] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!inboxTrades) return;

    setInlineNotes((prev) => {
      const next = { ...prev };
      for (const trade of inboxTrades) {
        if (!(trade._id in next)) {
          next[trade._id] = trade.notes ?? "";
        }
      }
      return next;
    });

    setInlineTradePlanIds((prev) => {
      const next = { ...prev };
      for (const trade of inboxTrades) {
        if (!(trade._id in next)) {
          next[trade._id] = trade.tradePlanId ? String(trade.tradePlanId) : "";
        }
      }
      return next;
    });
  }, [inboxTrades]);

  return {
    inlineNotes,
    inlineTradePlanIds,
    setInlineNotes,
    setInlineTradePlanIds,
  };
}
