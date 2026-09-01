"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ClipboardList } from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";
import { useVisiblePolling } from "../use-visible-polling";
import { formatEventDayLabel, formatEventTimeLabel } from "@/lib/events/types";

type Signup = {
  id: string;
  name: string;
  seated: boolean;
  telegramId: number;
  username: string | null;
};

type SignupsResponse = {
  event: { id: string; startsAt: string; title: string } | null;
  signups: Signup[];
  tablesCount: number;
};

export default function TMASignupsPage() {
  const { initData } = useTMA();
  const [data, setData] = useState<SignupsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [seatingId, setSeatingId] = useState<string | null>(null);
  const [table, setTable] = useState("1");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/event-signups", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  useVisiblePolling(() => void load());

  const seat = async (signup: Signup) => {
    const tg = getTelegramWebApp();
    if (seatingId) return;

    setSeatingId(signup.id);
    try {
      const res = await fetch(`/api/tma/event-signups/${signup.id}/seat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ table: Number(table) }),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        await load();
        return;
      }

      const payload = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(payload?.error ?? "Не удалось посадить игрока");
    } finally {
      setSeatingId(null);
    }
  };

  if (loading) return <div>Загрузка...</div>;

  const signups = data?.signups ?? [];
  const waiting = signups.filter((signup) => !signup.seated);
  const tableOptions = Array.from({ length: data?.tablesCount ?? 1 }, (_, index) => index + 1);

  return (
    <div className="space-y-4">
      <Link className="flex items-center gap-2 text-[var(--tg-theme-button-color)]" href="/tma/players">
        <ChevronLeft size={18} /> Игроки
      </Link>

      <h1 className="text-xl font-bold flex items-center gap-2">
        <ClipboardList size={20} /> Заявки
      </h1>

      {data?.event ? (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-xl">
          <p className="font-semibold">{data.event.title}</p>
          <p className="text-sm text-[var(--tg-theme-hint-color)]">
            {formatEventDayLabel(data.event.startsAt)}, {formatEventTimeLabel(data.event.startsAt)}
          </p>
        </div>
      ) : (
        <div className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-xl text-sm">
          Нет опубликованных турниров впереди. Создайте афишу в веб-админке.
        </div>
      )}

      <label className="block text-xs text-[var(--tg-theme-hint-color)]">
        Сажать за стол
        <select
          className="mt-1 w-full bg-[var(--tg-theme-secondary-bg-color)] text-[var(--tg-theme-text-color)] border-none rounded p-3 outline-none"
          value={table}
          onChange={(event) => setTable(event.target.value)}
        >
          {tableOptions.map((tableNumber) => (
            <option key={tableNumber} value={tableNumber}>
              Стол {tableNumber}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        {waiting.map((signup) => (
          <div
            key={signup.id}
            className="flex items-center justify-between gap-3 bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-lg"
          >
            <div className="min-w-0">
              <p className="font-semibold truncate">{signup.name}</p>
              {signup.username ? (
                <p className="text-xs text-[var(--tg-theme-hint-color)]">@{signup.username}</p>
              ) : null}
            </div>
            <button
              className="shrink-0 bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] px-4 py-2 rounded disabled:opacity-60"
              disabled={seatingId === signup.id}
              type="button"
              onClick={() => void seat(signup)}
            >
              {seatingId === signup.id ? "Сажаем..." : "Посадить"}
            </button>
          </div>
        ))}

        {waiting.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {signups.length === 0 ? "Заявок пока нет" : "Все записавшиеся уже за столами"}
          </div>
        ) : null}
      </div>

      {signups.some((signup) => signup.seated) ? (
        <section className="space-y-2 pt-2">
          <h2 className="text-sm text-[var(--tg-theme-hint-color)]">Уже за столом</h2>
          {signups
            .filter((signup) => signup.seated)
            .map((signup) => (
              <div
                key={signup.id}
                className="flex items-center gap-2 bg-[var(--tg-theme-secondary-bg-color)] p-3 rounded-lg text-sm"
              >
                <CheckCircle2 className="text-green-500" size={16} /> {signup.name}
              </div>
            ))}
        </section>
      ) : null}
    </div>
  );
}
