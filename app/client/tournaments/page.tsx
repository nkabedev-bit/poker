"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { tickClientSelection, useClientTMA } from "../layout";
import { GhostButton, GlassCard, LoadingScreen, NoEventsCard, PageHeading } from "../_components/ui";
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
    <div className="client-stagger flex flex-col gap-5 pt-1">
      <PageHeading subtitle="Расписание клуба и запись на игры" title="Турниры" />

      <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-club-line bg-club-surface p-1">
        {/* One thumb slides under the tab picked; the tabs themselves only change colour. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-xl bg-club-crimson transition-transform duration-[400ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
            tab === "past" ? "translate-x-[calc(100%+4px)]" : ""
          }`}
        />
        {TABS.map((item) => {
          const active = tab === item.id;

          return (
            <button
              key={item.id}
              aria-pressed={active}
              className={`relative h-10 rounded-xl text-[14px] font-bold transition-colors duration-300 ${
                active ? "text-white" : "text-club-muted"
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
        className={`flex flex-col gap-2.5 ${tab === "past" ? "client-slide-from-right" : "client-slide-from-left"}`}
        style={switched ? { animationDelay: "0ms" } : undefined}
      >
        {tab === "current" ? (
          events.length === 0 ? (
            <NoEventsCard />
          ) : (
            groupByWeek(events, new Date()).map((group) => (
              <section key={group.label} className="flex flex-col gap-2">
                <h2 className="px-1 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">
                  {group.label}
                </h2>
                {group.events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </section>
            ))
          )
        ) : !past ? (
          <LoadingScreen />
        ) : past.games.length === 0 ? (
          <GlassCard className="flex flex-col items-center gap-3 py-8 text-center">
            <Trophy className="text-club-faint" size={28} />
            <div className="text-sm text-club-muted">Прошедших турниров пока нет.</div>
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since 1970 by the club's calendar, Moscow's, so a week turns over at its midnight. */
function moscowDayNumber(time: Date) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  })
    .format(time)
    .split("-")
    .map(Number);

  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** Monday of the week a day falls in, as a day number. 1 January 1970 was a Thursday. */
function weekStart(dayNumber: number) {
  return dayNumber - ((dayNumber + 3) % 7);
}

/** The calendar in the club's weeks: this one, the next, and everything after. */
function groupByWeek(events: EventCardData[], now: Date) {
  const thisWeek = weekStart(moscowDayNumber(now));
  const groups: Array<{ events: EventCardData[]; label: string }> = [];

  for (const event of events) {
    const weeksAhead = Math.round((weekStart(moscowDayNumber(new Date(event.startsAt))) - thisWeek) / 7);
    const label = weeksAhead <= 0 ? "Эта неделя" : weeksAhead === 1 ? "Следующая неделя" : "Позже";
    const group = groups.at(-1);

    if (group?.label === label) {
      group.events.push(event);
    } else {
      groups.push({ events: [event], label });
    }
  }

  return groups;
}
