"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Trophy } from "lucide-react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen, ScreenMessage } from "../_components/ui";

type Schedule = { scheduleText: string; ratingUrl: string };

export default function ClientSchedulePage() {
  const { initData } = useClientTMA();
  const [data, setData] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/schedule", {
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

  if (loading) return <LoadingScreen />;

  const scheduleText = data?.scheduleText?.trim() ?? "";
  const ratingUrl = data?.ratingUrl?.trim() ?? "";

  return (
    <div className="space-y-5 pt-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold">Расписание турниров</h1>
        <p className="mt-1 text-sm text-white/55">Ближайшие игры Majestic.</p>
      </div>

      {scheduleText ? (
        <GlassCard className="space-y-3">
          <div className="flex items-center gap-2 text-amber-200/80">
            <CalendarClock size={18} />
            <span className="text-sm font-medium">Когда играем</span>
          </div>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-white/90">{scheduleText}</p>
        </GlassCard>
      ) : (
        <ScreenMessage
          icon={<CalendarClock size={34} />}
          title="Расписание пока не добавлено"
          subtitle="Загляните позже — организатор скоро опубликует ближайшие турниры."
        />
      )}

      {ratingUrl ? (
        <a
          href={ratingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-4 text-amber-200 transition active:scale-[0.98]"
        >
          <span className="flex items-center gap-2 font-medium">
            <Trophy size={18} /> Рейтинговая таблица
          </span>
          <ExternalLink size={18} />
        </a>
      ) : null}
    </div>
  );
}
