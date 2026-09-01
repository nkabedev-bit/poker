"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen, PageTitle } from "../_components/ui";
import { EventCard, type EventCardData } from "../_components/event-card";

export default function ClientTournamentsPage() {
  const { initData } = useClientTMA();
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/events", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
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

  return (
    <div className="space-y-4 pt-1">
      <PageTitle>Турниры</PageTitle>

      {events.length === 0 ? (
        <GlassCard className="py-8 text-center">
          <CalendarDays className="mx-auto mb-3 text-white/25" size={30} />
          <p className="text-[17px] font-bold">Ближайших турниров пока нет</p>
          <p className="mt-1.5 text-sm text-white/45">
            Как только появится новая игра, она возникнет здесь.
          </p>
        </GlassCard>
      ) : (
        events.map((event) => <EventCard key={event.id} event={event} />)
      )}
    </div>
  );
}
