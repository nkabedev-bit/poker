"use client";

import Link from "next/link";

/**
 * The "Ещё" tab holds the work done away from the tables: the posters, and the players'
 * bot with its broadcasts and settings. A strip on top switches between the two.
 */
export function MoreTabs({ current }: { current: "bot" | "events" }) {
  return (
    <nav aria-label="Разделы" className="tma-segment">
      <Link aria-current={current === "events" ? "page" : undefined} href="/tma/events">
        Афиши
      </Link>
      <Link aria-current={current === "bot" ? "page" : undefined} href="/tma/bot">
        Рассылка и бот
      </Link>
    </nav>
  );
}
