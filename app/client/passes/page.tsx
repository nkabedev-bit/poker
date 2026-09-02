"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ticket, TriangleAlert } from "lucide-react";
import { useClientTMA } from "../layout";
import { GhostButton, GlassCard, LoadingScreen, PageTitle } from "../_components/ui";

type FreeEntries = { regular: number; vip: number };

export default function ClientPassesPage() {
  const { initData } = useClientTMA();
  const [freeEntries, setFreeEntries] = useState<FreeEntries>({ regular: 0, vip: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (res.ok) {
        const data = await res.json();
        setFreeEntries({
          regular: Number(data.freeEntries?.regular ?? 0),
          vip: Number(data.freeEntries?.vip ?? 0),
        });
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

  const total = freeEntries.regular + freeEntries.vip;

  return (
    <div className="space-y-5 pt-1">
      <PageTitle>Бесплатные проходки</PageTitle>

      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="!p-[18px]">
          <p className="text-[11px] uppercase tracking-wider text-white/40">Обычные</p>
          <p className="mt-2 text-[30px] font-extrabold leading-none">{freeEntries.regular}</p>
        </GlassCard>
        <GlassCard className="border-[#e9c07a]/40 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] !p-[18px]">
          <p className="text-[11px] uppercase tracking-wider text-[#e9c07a]">VIP</p>
          <p className="mt-2 text-[30px] font-extrabold leading-none text-[#e9c07a]">
            {freeEntries.vip}
          </p>
        </GlassCard>
      </div>

      <GlassCard className="!p-4">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 shrink-0 text-[#f05a7e]" size={19} />
          <div className="space-y-1.5">
            <p className="text-sm font-bold">Внимание</p>
            <p className="text-sm leading-relaxed text-white/75">
              Проходки можно использовать только на вход в турнир. Проходка не даёт права на
              бесплатный ре-энтри или аддон.
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="!p-4">
        <div className="flex items-start gap-3">
          <Ticket className="mt-0.5 shrink-0 text-[#e9c07a]" size={19} />
          <p className="text-sm leading-relaxed text-white/75">
            {total > 0
              ? "Выберите проходку, когда записываетесь на турнир. Её спишут в день игры, когда администратор выдаст вам карту."
              : "Проходки выдаёт клуб. Как только вам их начислят, они появятся здесь."}
          </p>
        </div>
      </GlassCard>

      <Link className="block" href="/client">
        <GhostButton>К расписанию турниров</GhostButton>
      </Link>
    </div>
  );
}
