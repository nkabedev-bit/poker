"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useClientTMA } from "../layout";
import { GhostButton, GlassCard, LoadingScreen, NoEventsCard, PageTitle } from "../_components/ui";
import { EventCard, type EventCardData } from "../_components/event-card";
import { PastGameCard, type PastGameCardData } from "../_components/past-game-card";

type Tab = "current" | "past";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "current", label: "Актуальные" },
  { id: "past", label: "Прошедшие" },
];

/** The past games read so far, and where the next page of them starts. */
type PastGames = { games: PastGameCardData[]; next: string | null };

/** The tab the address names — so coming back from a game lands on the past tab. */
function readTabFromAddress(): Tab {
  return new URLSearchParams(window.location.search).get("tab") === "past" ? "past" : "current";
}

export default function ClientTournamentsPage() {
  const { initData } = useClientTMA();
  const [tab, setTab] = useState<Tab>("current");
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [past, setPast] = useState<PastGames | null>(null);
  const [pastLoading, setPastLoading] = useState(false);

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

  /** One more page of past games, from where the last one stopped. */
  const loadPast = useCallback(
    async (from: string | null) => {
      setPastLoading(true);
      try {
        const query = from ? `&from=${encodeURIComponent(from)}` : "";
        const res = await fetch(`/api/client-tma/games?scope=club${query}`, {
          headers: { "X-Telegram-Init-Data": initData },
        });
        if (!res.ok) return;

        const data = (await res.json()) as PastGames;
        setPast((current) => ({
          games: from && current ? [...current.games, ...data.games] : data.games,
          next: data.next,
        }));
      } finally {
        setPastLoading(false);
      }
    },
    [initData],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
      setTab(readTabFromAddress());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  // The past is read the first time somebody looks at it, not on every visit to the tab.
  useEffect(() => {
    if (tab !== "past" || past || pastLoading) return;

    const timeout = window.setTimeout(() => void loadPast(null), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPast, past, pastLoading, tab]);

  const chooseTab = (next: Tab) => {
    setTab(next);
    // Kept in the address, so the back button from a game returns to the same tab.
    window.history.replaceState(null, "", next === "past" ? "?tab=past" : window.location.pathname);
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="space-y-4 pt-1">
      <PageTitle>Турниры</PageTitle>

      <div className="grid grid-cols-2 gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
        {TABS.map((item) => {
          const active = tab === item.id;

          return (
            <button
              key={item.id}
              aria-pressed={active}
              className={`rounded-full py-2.5 text-[15px] font-semibold transition ${
                active
                  ? "bg-gradient-to-b from-[#c8163f]/80 to-[#7d0d26]/80 text-white shadow-[0_6px_18px_rgba(200,22,63,0.35)]"
                  : "text-white/50"
              }`}
              type="button"
              onClick={() => chooseTab(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "current" ? (
        events.length === 0 ? (
          <NoEventsCard />
        ) : (
          events.map((event) => <EventCard key={event.id} event={event} />)
        )
      ) : !past ? (
        <LoadingScreen />
      ) : past.games.length === 0 ? (
        <GlassCard className="py-8 text-center">
          <Trophy className="mx-auto mb-3 text-white/25" size={28} />
          <div className="text-sm text-white/45">Прошедших турниров пока нет.</div>
        </GlassCard>
      ) : (
        <>
          {past.games.map((game) => (
            <PastGameCard key={game.startedAt} game={game} />
          ))}
          {past.next ? (
            <GhostButton disabled={pastLoading} onClick={() => void loadPast(past.next)}>
              {pastLoading ? "Загружаем…" : "Показать ещё"}
            </GhostButton>
          ) : null}
        </>
      )}
    </div>
  );
}
