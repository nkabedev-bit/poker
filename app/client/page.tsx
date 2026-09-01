"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, Clock, LifeBuoy, MapPin, Spade, Users } from "lucide-react";
import { useClientTMA } from "./layout";
import { Badge, Chip, GlassCard, LoadingScreen, PrimaryButton, SectionHeader } from "./_components/ui";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

type EventCard = TournamentEvent & { signedUp: boolean; signupsCount: number };

type EventsResponse = {
  events: EventCard[];
  player: { displayName: string | null; profileSubmitted: boolean; username: string | null };
};

export default function ClientHomePage() {
  const { initData } = useClientTMA();
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/events", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <LoadingScreen />;

  const events = data?.events ?? [];
  const [nextEvent, ...laterEvents] = events;
  const playerName = data?.player.displayName?.trim() || "Гость";
  const address = events.find((event) => event.venueAddress)?.venueAddress ?? "";

  return (
    <div className="space-y-6 pt-2">
      <GlassCard className="flex items-center gap-3 !p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#b8163c] to-[#7d0d26] text-lg font-bold">
          {playerName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{playerName}</p>
          <p className="text-xs text-white/45">
            {data?.player.username ? `@${data.player.username}` : "Игрок клуба"}
          </p>
        </div>
      </GlassCard>

      {data && !data.player.profileSubmitted ? (
        <GlassCard className="space-y-3 border-[#b8163c]/40 bg-[#b8163c]/10">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 shrink-0 text-[#f05a7e]" size={20} />
            <div>
              <p className="text-base font-semibold">Заполните анкету</p>
              <p className="mt-1 text-sm text-white/60">
                Пара минут — и откроется запись на турниры.
              </p>
            </div>
          </div>
          <Link href="/client/onboarding">
            <PrimaryButton>Заполнить анкету</PrimaryButton>
          </Link>
        </GlassCard>
      ) : null}

      {nextEvent ? (
        <EventPoster event={nextEvent} featured />
      ) : (
        <GlassCard className="text-center">
          <CalendarDays className="mx-auto mb-3 text-white/35" size={28} />
          <p className="text-base font-semibold">Ближайших турниров пока нет</p>
          <p className="mt-1 text-sm text-white/50">
            Как только появится новая игра, она возникнет здесь.
          </p>
        </GlassCard>
      )}

      {laterEvents.length > 0 ? (
        <section className="space-y-3">
          <SectionHeader title="Дальше в календаре" />
          {laterEvents.map((event) => (
            <EventPoster key={event.id} event={event} />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeader href="/client/rating" title="Рейтинг" />
        <GlassCard className="text-center">
          <p className="text-sm text-white/55">
            Таблица рейтинга скоро появится здесь.
          </p>
        </GlassCard>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="!p-4">
          <LifeBuoy className="mb-2 text-white/45" size={20} />
          <p className="text-sm font-semibold">Поддержка</p>
          <p className="mt-1 text-xs text-white/45">Напишите админам в боте</p>
        </GlassCard>
        <GlassCard className="!p-4">
          <Spade className="mb-2 text-white/45" size={20} />
          <p className="text-sm font-semibold">О клубе</p>
          <p className="mt-1 text-xs text-white/45">Majestic Poker</p>
        </GlassCard>
      </div>

      {address ? (
        <GlassCard className="!p-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 shrink-0 text-white/45" size={18} />
            <div>
              <p className="text-sm font-semibold">Адрес</p>
              <p className="mt-1 text-sm text-white/55">{address}</p>
            </div>
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}

function EventPoster({ event, featured = false }: { event: EventCard; featured?: boolean }) {
  return (
    <Link className="block" href={`/client/events/${event.id}`}>
      <div
        className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#3a0a17] via-[#1a0509] to-[#0b0708] ${
          featured ? "p-5" : "p-4"
        }`}
      >
        {event.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
            src={event.posterUrl}
          />
        ) : null}

        <div className="relative space-y-3">
          <h3 className={`font-bold uppercase leading-tight ${featured ? "text-2xl" : "text-lg"}`}>
            {event.title}
          </h3>

          <div className="flex flex-wrap gap-2">
            <Chip>
              <CalendarDays size={13} /> {formatEventDayLabel(event.startsAt)}
            </Chip>
            <Chip>
              <Clock size={13} /> {formatEventTimeLabel(event.startsAt)}
            </Chip>
            {event.maxPlayers ? (
              <Chip>
                <Users size={13} /> {event.signupsCount} / {event.maxPlayers}
              </Chip>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {event.badge ? <Badge>{event.badge}</Badge> : null}
            {event.signedUp ? (
              <span className="rounded-full border border-emerald-400/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                Вы записаны
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
