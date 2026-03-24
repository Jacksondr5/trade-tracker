"use client";

import { useEffect, useRef, useState } from "react";
import type { InboxTrade } from "../types";

export function useInlineInboxEdits(inboxTrades: InboxTrade[] | undefined) {
  const [inlineTradePlanIds, setInlineTradePlanIds] = useState<Record<string, string>>({});
  const [inlinePortfolioIds, setInlinePortfolioIds] = useState<Record<string, string>>({});

  // Track last-known backend values to detect external changes (e.g. import task completion)
  const prevBackendRef = useRef<{
    tradePlanIds: Record<string, string>;
    portfolioIds: Record<string, string>;
  }>({ tradePlanIds: {}, portfolioIds: {} });

  useEffect(() => {
    if (!inboxTrades) return;

    const oldBackend = prevBackendRef.current;

    // Compute new backend snapshot
    const newBackendTradePlanIds: Record<string, string> = {};
    const newBackendPortfolioIds: Record<string, string> = {};
    for (const trade of inboxTrades) {
      newBackendTradePlanIds[trade._id] = trade.tradePlanId ? String(trade.tradePlanId) : "";
      newBackendPortfolioIds[trade._id] = trade.portfolioId ? String(trade.portfolioId) : "";
    }

    // Capture old values before updating the ref
    const oldTradePlanIds = oldBackend.tradePlanIds;
    const oldPortfolioIds = oldBackend.portfolioIds;

    // Update ref for next render
    prevBackendRef.current = {
      tradePlanIds: newBackendTradePlanIds,
      portfolioIds: newBackendPortfolioIds,
    };

    setInlineTradePlanIds((prev) => {
      const next = { ...prev };
      for (const trade of inboxTrades) {
        const backendValue = newBackendTradePlanIds[trade._id];
        const oldBackendValue = oldTradePlanIds[trade._id];

        if (!(trade._id in next)) {
          // New trade — initialize from backend
          next[trade._id] = backendValue;
        } else if (
          oldBackendValue !== undefined &&
          oldBackendValue !== backendValue
        ) {
          // Backend changed — sync if user hasn't manually diverged
          if (next[trade._id] === oldBackendValue) {
            next[trade._id] = backendValue;
          }
        }
      }
      return next;
    });

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
    inlineTradePlanIds,
    setInlinePortfolioIds,
    setInlineTradePlanIds,
  };
}
