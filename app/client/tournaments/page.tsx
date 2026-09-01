"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useClientTMA } from "../layout";
import { GlassCard, LoadingScreen } from "../_components/ui";
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
    <div className="space-y-4 pt-2">
      <h1 className="px-1 text-2xl font-bold">Турниры</h1>

      {events.length === 0 ? (
        <GlassCard className="text-center">
          <CalendarDays className="mx-auto mb-3 text-white/35" size={28} />
          <p className="text-base font-semibold">Ближайших турниров пока нет</p>
          <p className="mt-1 text-sm text-white/50">
            Как только появится новая игра, она возникнет здесь.
          </p>
        </GlassCard>
      ) : (
        events.map((event) => <EventCard key={event.id} event={event} />)
      )}
    </div>
  );
}
