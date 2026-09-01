"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardList, LifeBuoy, MapPin, Spade } from "lucide-react";
import { getClientTelegramWebApp, useClientTMA } from "./layout";
import { GlassCard, LoadingScreen, PrimaryButton, SectionHeader } from "./_components/ui";
import { EventCard, type EventCardData } from "./_components/event-card";
import { PlayerAvatar } from "./_components/player-avatar";
import { RatingRow, type RatingPlayer } from "./_components/rating-row";

type EventsResponse = {
  events: EventCardData[];
  player: { displayName: string | null; profileSubmitted: boolean; username: string | null };
};

type RatingResponse = { me: RatingPlayer; players: RatingPlayer[] };

const SUPPORT_TELEGRAM_URL = "https://t.me/markvasilyevv";

// openTelegramLink keeps the chat inside Telegram; outside the app (or on an old
// client) a plain window.open still gets the player there.
function openSupportChat() {
  const tg = getClientTelegramWebApp();
  tg?.HapticFeedback?.impactOccurred("light");

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(SUPPORT_TELEGRAM_URL);
    return;
  }

  window.open(SUPPORT_TELEGRAM_URL, "_blank", "noopener");
}

export default function ClientHomePage() {
  const { initData, telegramUser } = useClientTMA();
  const [data, setData] = useState<EventsResponse | null>(null);
  const [rating, setRating] = useState<RatingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [eventsRes, ratingRes] = await Promise.all([
        fetch("/api/client-tma/events", { headers: { "X-Telegram-Init-Data": initData } }),
        fetch("/api/client-tma/rating", { headers: { "X-Telegram-Init-Data": initData } }),
      ]);

      if (eventsRes.ok) setData(await eventsRes.json());
      if (ratingRes.ok) setRating(await ratingRes.json());
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
  const playerName = data?.player.displayName?.trim() || telegramUser?.first_name || "Гость";
  const address = events.find((event) => event.venueAddress)?.venueAddress ?? "";
  const topPlayers = rating?.players.slice(0, 3) ?? [];
  const me = rating?.me;
  const meInTop = topPlayers.some((player) => player.isMe);

  return (
    <div className="space-y-6 pt-2">
      <GlassCard className="flex items-center gap-3 !p-4">
        <PlayerAvatar name={playerName} photoUrl={telegramUser?.photo_url} size={48} />
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
        <EventCard event={nextEvent} featured />
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
          <SectionHeader href="/client/tournaments" title="Дальше в календаре" />
          {laterEvents.slice(0, 2).map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionHeader href="/client/rating" title="Рейтинг" />
        {topPlayers.length > 0 ? (
          <div className="space-y-2">
            {topPlayers.map((player) => (
              <RatingRow key={`${player.place}-${player.name}`} player={player} />
            ))}
            {me && !meInTop ? (
              <>
                <p className="text-center text-white/25">· · ·</p>
                <RatingRow player={me} />
              </>
            ) : null}
          </div>
        ) : (
          <GlassCard className="text-center">
            <p className="text-sm text-white/55">
              Рейтинг наполнится после первых сыгранных турниров.
            </p>
          </GlassCard>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button className="text-left" type="button" onClick={openSupportChat}>
          <GlassCard className="h-full !p-4">
            <LifeBuoy className="mb-2 text-white/45" size={20} />
            <p className="text-sm font-semibold">Поддержка</p>
            <p className="mt-1 text-xs text-white/45">Написать администратору</p>
          </GlassCard>
        </button>
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
