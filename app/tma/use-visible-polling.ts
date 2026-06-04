"use client";

import { useEffect } from "react";

export const TMA_POLL_INTERVAL_MS = 5000;

export function useVisiblePolling(callback: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        callback();
      }
    }, TMA_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [callback, enabled]);
}
