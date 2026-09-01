"use client";

import { useCallback, useEffect, useState } from "react";
import { Crosshair, Medal, Spade, Ticket, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen } from "../_components/ui";

type Me = {
  profileSubmitted: boolean;
  registered: { name: string; registrationNumber: number | null; table: number | null } | null;
  stats: { games: number; eliminations: number; top7: number };
};

export default function ClientProfilePage() {
  const { initData } = useClientTMA();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setMe(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen />;

  const name = me?.registered?.name?.trim() || "Игрок";
  const stats = me?.stats;

  return (
    <div className="space-y-5 pt-2">
      <GlassCard className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-[#b8163c] to-[#7d0d26] text-2xl font-bold">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xl font-bold">{name}</p>
          <p className="text-sm text-white/45">
            {me?.profileSubmitted ? "Анкета заполнена" : "Анкета не заполнена"}
          </p>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          icon={<Ticket size={18} />}
          label="Бесплатные проходки"
          value="—"
          hint="Скоро"
        />
        <StatTile icon={<Trophy size={18} />} label="Рейтинг" value="—" hint="Скоро" />
      </div>

      <section className="space-y-3">
        <h2 className="px-1 text-lg font-bold">Статистика</h2>
        <StatRow icon={<Spade size={20} />} label="Сыграно игр" value={stats?.games ?? 0} />
        <StatRow
          icon={<Crosshair size={20} />}
          label="Выбиваний соперников"
          value={Math.round(stats?.eliminations ?? 0)}
        />
        <StatRow icon={<Medal size={20} />} label="Попаданий в топ-7" value={stats?.top7 ?? 0} />
      </section>

      {me?.registered ? (
        <GlassCard>
          <p className="text-sm font-semibold">Вы в игре прямо сейчас</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-2xl font-bold text-[#e8b465]">
                {me.registered.registrationNumber ?? "—"}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-white/45">Номер</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-2xl font-bold text-[#e8b465]">{me.registered.table ?? "—"}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-white/45">Стол</p>
            </div>
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}

function StatTile({
  hint,
  icon,
  label,
  value,
}: {
  hint?: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <GlassCard className="!p-4">
      <span className="text-white/45">{icon}</span>
      <p className="mt-2 text-2xl font-bold text-[#e8b465]">{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
      {hint ? <p className="text-[11px] text-white/30">{hint}</p> : null}
    </GlassCard>
  );
}

function StatRow({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <GlassCard className="flex items-center gap-4 !p-4">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#b8163c]/15 text-[#f05a7e]">
        {icon}
      </span>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-xs text-white/50">{label}</p>
      </div>
    </GlassCard>
  );
}
