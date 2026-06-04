"use client";

import { useEffect } from "react";

const scrollKey = "poker-admin-scroll-y";

export function AdminScrollRestorer() {
  useEffect(() => {
    let restoreTimers: number[] = [];

    function clearRestoreTimers() {
      restoreTimers.forEach((timer) => window.clearTimeout(timer));
      restoreTimers = [];
    }

    function stopRestoringForUserScroll() {
      clearRestoreTimers();
      window.sessionStorage.removeItem(scrollKey);
    }

    function restoreStoredScroll({ clear }: { clear: boolean }) {
      const stored = window.sessionStorage.getItem(scrollKey);
      if (!stored) return;

      const top = Number(stored);
      if (!Number.isFinite(top)) {
        window.sessionStorage.removeItem(scrollKey);
        return;
      }

      window.scrollTo({ top, left: 0 });
      if (clear) window.sessionStorage.removeItem(scrollKey);
    }

    function scheduleRestore() {
      clearRestoreTimers();
      restoreTimers = [80, 160, 320, 640, 1000, 1500, 2200].map((delay, index, list) =>
        window.setTimeout(() => {
          restoreStoredScroll({ clear: index === list.length - 1 });
        }, delay),
      );
    }

    function saveScroll() {
      window.sessionStorage.setItem(scrollKey, String(window.scrollY));
      scheduleRestore();
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => restoreStoredScroll({ clear: false }));
    });
    scheduleRestore();

    function saveScrollOnSubmitClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('button[type="submit"], input[type="submit"]')) {
        saveScroll();
      }
    }

    document.addEventListener("click", saveScrollOnSubmitClick, true);
    document.addEventListener("submit", saveScroll, true);
    document.addEventListener("wheel", stopRestoringForUserScroll, true);
    document.addEventListener("touchstart", stopRestoringForUserScroll, true);
    document.addEventListener("pointerdown", stopRestoringForUserScroll, true);
    document.addEventListener("keydown", stopRestoringForUserScroll, true);
    return () => {
      clearRestoreTimers();
      document.removeEventListener("click", saveScrollOnSubmitClick, true);
      document.removeEventListener("submit", saveScroll, true);
      document.removeEventListener("wheel", stopRestoringForUserScroll, true);
      document.removeEventListener("touchstart", stopRestoringForUserScroll, true);
      document.removeEventListener("pointerdown", stopRestoringForUserScroll, true);
      document.removeEventListener("keydown", stopRestoringForUserScroll, true);
    };
  }, []);

  return null;
}
