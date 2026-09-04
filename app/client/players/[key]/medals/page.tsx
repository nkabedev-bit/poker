"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Medal as MedalIcon } from "lucide-react";
import { useClientTMA } from "../../../layout";
import { LoadingScreen, PageTitle } from "../../../_components/ui";
import { MedalCard } from "../../../_components/award-cards";
import { countEarnedMedals, getMedals, MEDALS_TOTAL, type Medal } from "@/lib/client/medals";

/** Another player's medals, on the same screen their own would use. */
export default function PlayerMedalsPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ key: string }>();
  const playerKey = params?.key;

  const [name, setName] = useState("");
  const [medals, setMedals] = useState<Medal[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!playerKey) return;
    try {
      const res = await fetch(`/api/client-tma/players/${playerKey}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (res.ok) {
        const data = await res.json();
        setName(String(data.player?.name ?? ""));
        setMedals(getMedals(data.player?.medals));
      }
    } finally {
      setLoading(false);
    }
  }, [initData, playerKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading || !medals) return <LoadingScreen />;

  return (
    <div className="space-y-6 pt-1">
      <div>
        <PageTitle>Медали</PageTitle>
        <p className="mt-1 flex items-center gap-2 text-sm text-white/40">
          <MedalIcon size={15} /> {name} · {countEarnedMedals(medals)} из {MEDALS_TOTAL}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {medals.map((medal) => (
          <MedalCard key={medal.key} medal={medal} />
        ))}
      </div>
    </div>
  );
}
