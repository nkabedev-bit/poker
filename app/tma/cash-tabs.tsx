"use client";

import Link from "next/link";

/**
 * The "Касса" tab works tonight's room and the money owed from past evenings. A strip
 * on top switches between the two, the way "Ещё" switches posters and the bot.
 */
export function CashTabs({ current }: { current: "debts" | "evening" }) {
  return (
    <nav aria-label="Разделы кассы" className="tma-segment">
      <Link aria-current={current === "evening" ? "page" : undefined} href="/tma/cards">
        Вечер
      </Link>
      <Link aria-current={current === "debts" ? "page" : undefined} href="/tma/cards/debts">
        Долги
      </Link>
    </nav>
  );
}
