"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  LifeBuoy,
  MapPin,
  Megaphone,
  Spade,
} from "lucide-react";
import { getClientTelegramWebApp, useClientTMA } from "./layout";
import {
  GlassCard,
  LoadingScreen,
  NoEventsCard,
  PrimaryButton,
  SectionHeader,
} from "./_components/ui";
import { EventCard, type EventCardData } from "./_components/event-card";
import { PlayerAvatar } from "./_components/player-avatar";
import { RatingRow, withOwnPhoto, type RatingPlayer } from "./_components/rating-row";
import { LiveTournamentCard } from "./_components/live-tournament-card";
import { useLiveTournament } from "./_components/use-live-tournament";
import { pickPlayerPhoto } from "@/lib/players/photo";
import type { ClientLiveState } from "@/lib/client-tma/live-state-shared";
import { isEventEveningOpen } from "@/lib/events/types";

type EventsResponse = {
  events: EventCardData[];
  /** The game being played right now; null when the room is quiet. */
  live: ClientLiveState | null;
  player: {
    avatarIsCustom?: boolean;
    avatarUrl?: string | null;
    canClaimProfile?: boolean;
    displayName: string | null;
    profileSubmitted: boolean;
    username: string | null;
  };
};

type RatingResponse = { me: RatingPlayer; players: RatingPlayer[] };

const SUPPORT_TELEGRAM_URL = "https://t.me/markvasilyevv";

// The club plays the APC club cup in St Petersburg on 10 October, and the home screen
// points players at the post about it. The last qualifier is played on 6 October and runs
// past midnight, so the card stays up until the morning after.
const APC_CUP_POST_URL = "https://t.me/majesticpokerptz/1069";
const APC_CUP_CARD_UNTIL = Date.parse("2026-10-07T10:00:00+03:00");

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
  const [showApcCupCard, setShowApcCupCard] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // The clock is read as the screen loads rather than while it renders.
    setShowApcCupCard(Date.now() < APC_CUP_CARD_UNTIL);

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

  const events = data?.events ?? [];
  // Nothing is asked of the club away from game days: the card can only appear on the
  // evening of a game, so that is the only time a phone watches for it. Once a game is
  // on, the hook keeps watching it until it finishes, whatever the hour.
  const playsToday = events.some((event) => isEventEveningOpen(event, new Date()));
  const { live } = useLiveTournament({
    enabled: Boolean(data) && (Boolean(data?.live) || playsToday),
    initData,
    initial: data?.live ?? null,
  });

  if (loading) return <LoadingScreen />;

  const [nextEvent, ...laterEvents] = events;
  // Which poster the game under way belongs to, so tapping the card opens its tables.
  const playingEvent = events.find((event) => isEventEveningOpen(event, new Date()));
  const playerName = data?.player.displayName?.trim() || telegramUser?.first_name || "Гость";
  const address = events.find((event) => event.venueAddress)?.venueAddress ?? "";
  const photoUrl = pickPlayerPhoto({
    avatarUrl: data?.player.avatarUrl,
    telegramPhotoUrl: telegramUser?.photo_url,
  });
  const topPlayers = withOwnPhoto(rating?.players.slice(0, 3) ?? [], photoUrl);
  const me = rating?.me ? withOwnPhoto([rating.me], photoUrl)[0] : undefined;
  const meInTop = topPlayers.some((player) => player.isMe);

  // Inside Telegram the post opens in Telegram itself. On the web the link opens a new
  // tab on its own: the Telegram script is loaded there too, and its openTelegramLink
  // would take the whole app away to t.me.
  const openApcCupPost = (event: MouseEvent<HTMLAnchorElement>) => {
    const tg = getClientTelegramWebApp();
    if (!initData || !tg?.openTelegramLink) return;

    event.preventDefault();
    tg.HapticFeedback?.impactOccurred("light");
    tg.openTelegramLink(APC_CUP_POST_URL);
  };

  return (
    <div className="space-y-7 pt-1">
      <div className="flex items-center gap-3">
        <PlayerAvatar name={playerName} photoUrl={photoUrl} size={52} />
        <div className="min-w-0">
          <p className="truncate text-[19px] font-bold tracking-tight">{playerName}</p>
          <p className="text-[13px] text-white/40">
            {data?.player.username ? `@${data.player.username}` : "Игрок клуба"}
          </p>
        </div>
      </div>

      {data && !data.player.profileSubmitted ? (
        <GlassCard className="space-y-4 border-[#c8163f]/40 bg-[linear-gradient(135deg,rgba(200,22,63,0.18),rgba(200,22,63,0.04))]">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 shrink-0 text-[#f05a7e]" size={22} />
            <div>
              <p className="text-[17px] font-bold">
                {data.player.canClaimProfile ? "Ещё пара шагов" : "Заполните анкету"}
              </p>
              <p className="mt-1 text-sm text-white/55">
                {data.player.canClaimProfile
                  ? "Играли у нас раньше — найдём ваш профиль. Впервые — заполните анкету."
                  : "Пара минут — и откроется запись на турниры."}
              </p>
            </div>
          </div>
          {/* Somebody who signed in on the web may have been playing here for years, so
              the fork stays reachable: reloading the app used to leave them with a new
              questionnaire as the only way forward. */}
          <Link href={data.player.canClaimProfile ? "/client/link" : "/client/onboarding"}>
            <PrimaryButton>
              {data.player.canClaimProfile ? "Продолжить" : "Заполнить анкету"}
            </PrimaryButton>
          </Link>
        </GlassCard>
      ) : null}

      {showApcCupCard ? (
        <a
          className="block transition-transform active:scale-[0.98]"
          href={APC_CUP_POST_URL}
          rel="noopener noreferrer"
          target="_blank"
          onClick={openApcCupPost}
        >
          <GlassCard className="space-y-2">
            <div className="flex items-center gap-2">
              <Megaphone className="text-[#e9c07a]" size={15} />
              <span className="text-[12px] font-semibold uppercase tracking-wider text-white/45">
                Объявление клуба
              </span>
            </div>
            <p className="text-[15px] leading-relaxed text-white/85">
              10 октября команда Majestic представит Петрозаводск и Карелию на Кубке клубов APC
              в Санкт-Петербурге
            </p>
            <p className="flex items-center gap-1 text-[13px] font-semibold text-[#f05a7e]">
              Нажмите, чтобы узнать подробности
              <ChevronRight size={15} />
            </p>
          </GlassCard>
        </a>
      ) : null}

      {live ? (
        <LiveTournamentCard
          href={playingEvent ? `/client/events/${playingEvent.id}` : undefined}
          live={live}
        />
      ) : null}

      {nextEvent ? (
        <EventCard event={nextEvent} featured />
      ) : (
        <NoEventsCard />
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
          <GlassCard className="py-7 text-center">
            <p className="text-sm text-white/45">
              Рейтинг наполнится после первых сыгранных турниров.
            </p>
          </GlassCard>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button className="text-left active:scale-[0.98] transition-transform" type="button" onClick={openSupportChat}>
          <GlassCard className="h-full !p-[18px]">
            <LifeBuoy className="mb-3 text-[#f05a7e]" size={22} />
            <p className="text-[15px] font-bold">Поддержка</p>
            <p className="mt-1 text-[12px] text-white/40">Написать администратору</p>
          </GlassCard>
        </button>
        <Link className="active:scale-[0.98] transition-transform" href="/client/about">
          <GlassCard className="h-full !p-[18px]">
            <Spade className="mb-3 text-[#e9c07a]" size={22} />
            <p className="text-[15px] font-bold">О клубе</p>
            <p className="mt-1 text-[12px] text-white/40">Majestic Poker</p>
          </GlassCard>
        </Link>
      </div>

      {address ? (
        <GlassCard className="!p-[18px]">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 shrink-0 text-[#f05a7e]" size={19} />
            <div>
              <p className="text-[15px] font-bold">Адрес</p>
              <p className="mt-1 text-sm leading-relaxed text-white/50">{address}</p>
            </div>
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}
