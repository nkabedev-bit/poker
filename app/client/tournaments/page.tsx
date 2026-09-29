"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { tickClientSelection, useClientTMA } from "../layout";
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
  // Set once the player switches tabs themselves: from then on a list slides in at once.
  const [switched, setSwitched] = useState(false);

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
    if (next === tab) return;

    tickClientSelection();
    setTab(next);
    setSwitched(true);
    // Kept in the address, so the back button from a game returns to the same tab.
    window.history.replaceState(null, "", next === "past" ? "?tab=past" : window.location.pathname);
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="client-stagger space-y-4 pt-1">
      <PageTitle>Турниры</PageTitle>

      <div className="relative grid grid-cols-2 gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] p-1">
        {/* One thumb slides under the tab picked; the tabs themselves only change colour. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-full bg-gradient-to-b from-[#c8163f]/80 to-[#7d0d26]/80 shadow-[0_6px_18px_rgba(200,22,63,0.35)] transition-transform duration-[400ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            tab === "past" ? "translate-x-[calc(100%+4px)]" : ""
          }`}
        />
        {TABS.map((item) => {
          const active = tab === item.id;

          return (
            <button
              key={item.id}
              aria-pressed={active}
              className={`relative rounded-full py-2.5 text-[15px] font-semibold transition-colors duration-300 ${
                active ? "text-white" : "text-white/50"
              }`}
              type="button"
              onClick={() => chooseTab(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Keyed by the tab, so the list comes in from the side of the tab just picked.
          Only the first showing waits for its turn in the screen's cascade. */}
      <div
        key={tab}
        className={`flex flex-col gap-4 ${tab === "past" ? "client-slide-from-right" : "client-slide-from-left"}`}
        style={switched ? { animationDelay: "0ms" } : undefined}
      >
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
    </div>
  );
}
