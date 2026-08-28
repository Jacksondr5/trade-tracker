"use client";

import { useEffect, useRef, useState } from "react";
import type { InboxTrade } from "../types";

export function useInlineInboxEdits(inboxTrades: InboxTrade[] | undefined) {
  const [inlinePortfolioIds, setInlinePortfolioIds] = useState<
    Record<string, string>
  >({});

  // Track last-known backend values to detect external changes (e.g. import task completion)
  const prevBackendRef = useRef<{
    portfolioIds: Record<string, string>;
  }>({ portfolioIds: {} });

  useEffect(() => {
    if (!inboxTrades) return;

    const oldBackend = prevBackendRef.current;

    // Compute new backend snapshot
    const newBackendPortfolioIds: Record<string, string> = {};
    for (const trade of inboxTrades) {
      newBackendPortfolioIds[trade._id] = trade.portfolioId
        ? String(trade.portfolioId)
        : "";
    }

    // Capture old values before updating the ref
    const oldPortfolioIds = oldBackend.portfolioIds;

    // Update ref for next render
    prevBackendRef.current = {
      portfolioIds: newBackendPortfolioIds,
    };

    setInlinePortfolioIds((prev) => {
      const next = { ...prev };
      for (const trade of inboxTrades) {
        const backendValue = newBackendPortfolioIds[trade._id];
        const oldBackendValue = oldPortfolioIds[trade._id];

        if (!(trade._id in next)) {
          next[trade._id] = backendValue;
        } else if (
          oldBackendValue !== undefined &&
          oldBackendValue !== backendValue
        ) {
          if (next[trade._id] === oldBackendValue) {
            next[trade._id] = backendValue;
          }
        }
      }
      return next;
    });
  }, [inboxTrades]);

  return {
    inlinePortfolioIds,
    setInlinePortfolioIds,
  };
}
