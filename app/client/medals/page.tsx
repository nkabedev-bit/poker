"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientTMA } from "../layout";
import { LoadingScreen, PageTitle } from "../_components/ui";
import { CollectionSummary, MedalCard } from "../_components/award-cards";
import {
  countEarnedMedals,
  getArchiveMedals,
  getMedals,
  MEDALS_TOTAL,
  type Medal,
} from "@/lib/client/medals";
import { ArchiveMedals } from "../_components/archive-medals";

export default function ClientMedalsPage() {
  const { initData } = useClientTMA();
  const [medals, setMedals] = useState<Medal[] | null>(null);
  const [archive, setArchive] = useState<Medal[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setMedals(getMedals(data.medals));
        setArchive(getArchiveMedals(data.archiveMedals));
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen shape="grid" />;

  const list = medals ?? getMedals({});
  const earned = countEarnedMedals(list);

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:gap-8">
      <PageTitle>Медали</PageTitle>

      <div className="md:max-w-[520px]">
        <CollectionSummary
          earned={earned}
          hint="Медаль даётся за победу в турнире. Каждый тип турнира — своя медаль, а счётчик показывает, сколько раз ты его выиграл."
          label="Получено"
          total={MEDALS_TOTAL}
        />
      </div>

      <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 md:gap-4">
        {list.map((medal) => (
          <MedalCard key={medal.key} medal={medal} />
        ))}
      </div>

      <ArchiveMedals medals={archive ?? getArchiveMedals({})} />
    </div>
  );
}
