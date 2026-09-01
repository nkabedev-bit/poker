"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Returns to the screen the player came from. Screens outside the bottom navigation are
 * reachable from more than one place — the rating opens from both the home screen and the
 * profile — so a fixed href would send half of the visitors to the wrong screen. The
 * fallback covers a deep link opened with no history behind it.
 */
export function BackLink({ fallbackHref = "/client" }: { fallbackHref?: string }) {
  const router = useRouter();

  return (
    <button
      className="flex items-center gap-1 text-sm text-white/60"
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push(fallbackHref);
      }}
    >
      <ChevronLeft size={18} /> Назад
    </button>
  );
}
