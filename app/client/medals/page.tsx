"use client";

import { useCallback, useEffect, useState } from "react";
import { Medal as MedalIcon } from "lucide-react";
import { useClientTMA } from "../layout";
import { LoadingScreen } from "../_components/ui";
import { MedalCard } from "../_components/award-cards";
import { countEarnedMedals, getMedals, MEDALS_TOTAL, type Medal } from "@/lib/client/medals";

export default function ClientMedalsPage() {
  const { initData } = useClientTMA();
  const [medals, setMedals] = useState<Medal[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setMedals(getMedals(data.medals));
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen />;

  const list = medals ?? getMedals({});
  const earned = countEarnedMedals(list);
  const progress = Math.round((earned / MEDALS_TOTAL) * 100);

  return (
    <div className="space-y-7 pt-1">

      <div className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#c8163f,#7d0d26)] p-5 shadow-[0_14px_38px_rgba(200,22,63,0.35)]">
        <MedalIcon
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-3 text-white/15"
          size={132}
          strokeWidth={1.2}
        />
        <p className="text-[26px] font-bold tracking-tight">Медали</p>
        <div className="mt-4 h-1.5 w-full max-w-[60%] overflow-hidden rounded-full bg-black/25">
          <div className="h-full rounded-full bg-white/85" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-3 flex items-center gap-2 text-[15px] font-bold">
          Получено
          <MedalIcon size={16} />
          {earned} / {MEDALS_TOTAL}
        </p>
      </div>

      <p className="text-center text-[13px] leading-relaxed text-white/40">
        Медаль даётся за победу в турнире. Каждый тип турнира — своя медаль, а счётчик
        показывает, сколько раз ты его выиграл.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {list.map((medal) => (
          <MedalCard key={medal.key} medal={medal} />
        ))}
      </div>
    </div>
  );
}
