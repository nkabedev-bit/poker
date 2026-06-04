"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Crosshair, Medal, Spade } from "lucide-react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen } from "../_components/ui";

type Stats = { games: number; eliminations: number; top7: number };

export default function ClientAchievementsPage() {
  const { initData } = useClientTMA();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats as Stats);
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

  const games = stats?.games ?? 0;
  const eliminations = Math.round(stats?.eliminations ?? 0);
  const top7 = stats?.top7 ?? 0;

  return (
    <div className="space-y-5 pt-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold">Достижения</h1>
        <p className="mt-1 text-sm text-white/55">Ваша статистика по всем играм Majestic.</p>
      </div>

      <MetricCard
        icon={<Spade size={26} />}
        accent="from-emerald-400/20 to-emerald-500/5 text-emerald-300"
        value={games}
        label="Сыграно игр"
      />
      <MetricCard
        icon={<Crosshair size={26} />}
        accent="from-rose-400/20 to-rose-500/5 text-rose-300"
        value={eliminations}
        label="Выбиваний соперников"
      />
      <MetricCard
        icon={<Medal size={26} />}
        accent="from-amber-300/25 to-amber-500/5 text-amber-300"
        value={top7}
        label="Попаданий в топ-7"
      />
    </div>
  );
}

function MetricCard({
  icon,
  accent,
  value,
  label,
}: {
  icon: ReactNode;
  accent: string;
  value: number;
  label: string;
}) {
  return (
    <GlassCard className="flex items-center gap-4">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-4xl font-extrabold leading-none">{value}</p>
        <p className="mt-2 text-sm text-white/55">{label}</p>
      </div>
    </GlassCard>
  );
}
