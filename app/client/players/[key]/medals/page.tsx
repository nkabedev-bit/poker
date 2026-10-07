"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useClientTMA } from "../../../layout";
import { LoadingScreen, PageHeading } from "../../../_components/ui";
import { MedalCard, CollectionSummary } from "../../../_components/award-cards";
import {
  countEarnedMedals,
  getArchiveMedals,
  getMedals,
  MEDALS_TOTAL,
  type Medal,
} from "@/lib/client/medals";
import { ArchiveMedals } from "../../../_components/archive-medals";

/** Another player's medals, on the same screen their own would use. */
export default function PlayerMedalsPage() {
  const { initData } = useClientTMA();
  const params = useParams<{ key: string }>();
  const playerKey = params?.key;

  const [name, setName] = useState("");
  const [medals, setMedals] = useState<Medal[] | null>(null);
  const [archive, setArchive] = useState<Medal[] | null>(null);
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
        setArchive(getArchiveMedals(data.player?.archiveMedals));
      }
    } finally {
      setLoading(false);
    }
  }, [initData, playerKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading || !medals) return <LoadingScreen shape="grid" />;

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:gap-8">
      <PageHeading subtitle={name} title="Медали" />

      <div className="md:max-w-[520px]">
        <CollectionSummary earned={countEarnedMedals(medals)} label="Получено" total={MEDALS_TOTAL} />
      </div>

      <div className="grid grid-cols-3 gap-2.5 md:grid-cols-4 md:gap-4">
        {medals.map((medal) => (
          <MedalCard key={medal.key} medal={medal} />
        ))}
      </div>

      <ArchiveMedals medals={archive ?? getArchiveMedals({})} />
    </div>
  );
}
