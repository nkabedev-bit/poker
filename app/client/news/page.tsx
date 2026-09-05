"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen, PageTitle, ScreenMessage } from "../_components/ui";
import type { Announcement } from "@/lib/client/announcements";

/** Moscow wall time, the way every other date in the app is written. */
function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Europe/Moscow",
  }).format(new Date(iso));
}

export default function ClientNewsPage() {
  const { initData } = useClientTMA();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/announcements", {
        headers: { "X-Telegram-Init-Data": initData },
      });

      setAnnouncements(res.ok ? ((await res.json()).announcements ?? []) : []);
    } catch {
      setAnnouncements([]);
    }

    // Opening the feed is what "read" means. Nothing depends on the answer, so it is
    // not waited on — the badge is gone by the next screen either way.
    void fetch("/api/client-tma/announcements", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    }).catch(() => {});
  }, [initData]);

  useEffect(() => {
    void load();
  }, [load]);

  if (announcements === null) return <LoadingScreen />;

  if (announcements.length === 0) {
    return (
      <ScreenMessage
        icon={<Megaphone size={30} />}
        title="Пока тихо"
        subtitle="Здесь появятся объявления клуба — переносы, анонсы и всё, о чём стоит знать."
      />
    );
  }

  return (
    <div className="space-y-5 pt-1">
      <PageTitle>Объявления</PageTitle>

      <div className="space-y-3">
        {announcements.map((item) => (
          <GlassCard key={item.id} className="space-y-2">
            <p className="text-[12px] uppercase tracking-wider text-white/35">
              {formatWhen(item.createdAt)}
            </p>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">
              {item.message}
            </p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
