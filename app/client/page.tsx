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
  Trophy,
} from "lucide-react";
import { getClientTelegramWebApp, useClientTMA } from "./layout";
import {
  Eyebrow,
  GlassCard,
  IconTile,
  LoadingScreen,
  NoEventsCard,
  Pill,
  PrimaryLink,
  SectionHeader,
} from "./_components/ui";
import { EventCard, type EventCardData } from "./_components/event-card";
import { PlayerAvatar } from "./_components/player-avatar";
import { RatingRow, withOwnPhoto, type RatingPlayer } from "./_components/rating-row";
import { LiveTournamentCard } from "./_components/live-tournament-card";
import { InstallBanner } from "./_components/install-banner";
import { useLiveTournament } from "./_components/use-live-tournament";
import { pickPlayerPhoto } from "@/lib/players/photo";
import type { ClientLiveState } from "@/lib/client-tma/live-state-shared";
import { isEventEveningOpen } from "@/lib/events/types";
import { TIER_TITLES } from "@/lib/players/tier";

type EventsResponse = {
  events: EventCardData[];
  /** The game being played right now; null when the room is quiet. */
  live: ClientLiveState | null;
  player: {
    avatarIsCustom?: boolean;
    avatarUrl?: string | null;
    canClaimProfile?: boolean;
    displayName: string | null;
    /** The player's own favourite hand ("QsTs"), drawn on their avatar. */
    favoriteHand?: string | null;
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

  if (loading) return <LoadingScreen shape="home" />;

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

  const myTier = me?.tier ?? null;
  const myPlace = me?.place ?? null;

  return (
    <div className="client-stagger flex flex-col gap-6 pt-1">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-[14px] text-club-muted">{greeting(new Date())},</p>
          <p className="truncate font-display text-[26px] font-semibold tracking-[-0.02em]">{playerName}</p>
          {myTier || myPlace ? (
            <div className="mt-1.5 flex gap-1.5">
              {myTier ? <Pill tone="goldOutline">{TIER_TITLES[myTier]}</Pill> : null}
              {myPlace ? (
                <Link href="/client/rating">
                  <Pill>
                    <Trophy size={14} /> {myPlace} место
                  </Pill>
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <Link aria-label="Профиль" className="shrink-0" href="/client/profile">
          <PlayerAvatar
            hand={data?.player.favoriteHand}
            name={playerName}
            photoUrl={photoUrl}
            ring="crimson"
            size={60}
          />
        </Link>
      </div>

      {data && !data.player.profileSubmitted ? (
        <div className="flex flex-col gap-4 rounded-[20px] border border-club-rose/45 bg-club-crimson/12 p-4">
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-0.5 shrink-0 text-club-rose" size={22} />
            <div className="flex flex-col gap-1">
              <p className="text-[16px] font-extrabold">
                {data.player.canClaimProfile ? "Ещё пара шагов" : "Заполните анкету"}
              </p>
              <p className="text-[13px] text-club-muted">
                {data.player.canClaimProfile
                  ? "Играли у нас раньше — найдём ваш профиль. Впервые — заполните анкету."
                  : "Пара минут — и откроется запись на турниры."}
              </p>
            </div>
          </div>
          {/* Somebody who signed in on the web may have been playing here for years, so
              the fork stays reachable: reloading the app used to leave them with a new
              questionnaire as the only way forward. */}
          <PrimaryLink href={data.player.canClaimProfile ? "/client/link" : "/client/onboarding"}>
            {data.player.canClaimProfile ? "Продолжить" : "Заполнить анкету"}
          </PrimaryLink>
        </div>
      ) : null}

      {live ? (
        <LiveTournamentCard
          href={playingEvent ? `/client/events/${playingEvent.id}` : undefined}
          live={live}
        />
      ) : null}

      <InstallBanner />

      {nextEvent ? (
        <EventCard event={nextEvent} featured />
      ) : (
        <NoEventsCard />
      )}

      {showApcCupCard ? (
        <a
          className="flex items-center gap-3.5 rounded-[20px] border border-club-gold/30 bg-club-gold/[0.08] px-4 py-3.5 transition-transform active:scale-[0.98]"
          href={APC_CUP_POST_URL}
          rel="noopener noreferrer"
          target="_blank"
          onClick={openApcCupPost}
        >
          <IconTile className="!bg-club-gold/15">
            <Megaphone size={20} />
          </IconTile>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Eyebrow className="!text-club-gold">Объявление клуба</Eyebrow>
            <p className="text-[14px] leading-snug">
              10 октября команда Majestic представит Петрозаводск и Карелию на Кубке клубов APC
              в Санкт-Петербурге
            </p>
          </div>
          <ChevronRight className="shrink-0 text-club-gold" size={18} />
        </a>
      ) : null}

      {laterEvents.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionHeader href="/client/tournaments" title="Дальше в календаре" />
          {laterEvents.slice(0, 2).map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <SectionHeader href="/client/rating" linkLabel="Весь" title="Рейтинг" />
        {topPlayers.length > 0 ? (
          <div className="client-stagger-rows flex flex-col gap-1.5">
            {topPlayers.map((player) => (
              <RatingRow key={`${player.place}-${player.name}`} player={player} />
            ))}
            {me && !meInTop ? (
              <>
                <p className="text-center tracking-[0.3em] text-club-faint">· · ·</p>
                <RatingRow player={me} />
              </>
            ) : null}
          </div>
        ) : (
          <GlassCard className="py-7 text-center">
            <p className="text-sm text-club-muted">
              Рейтинг наполнится после первых сыгранных турниров.
            </p>
          </GlassCard>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <button
          className="flex flex-col gap-3 rounded-[20px] border border-club-line bg-club-surface p-4 text-left transition-transform active:scale-[0.98]"
          type="button"
          onClick={openSupportChat}
        >
          <LifeBuoy className="text-club-rose" size={22} />
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] font-extrabold">Поддержка</p>
            <p className="text-[12px] text-club-muted">Написать администратору</p>
          </div>
        </button>
        <Link
          className="flex flex-col gap-3 rounded-[20px] border border-club-line bg-club-surface p-4 transition-transform active:scale-[0.98]"
          href="/client/about"
        >
          <Spade className="text-club-gold" size={22} />
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] font-extrabold">О клубе</p>
            <p className="text-[12px] text-club-muted">Majestic Poker</p>
          </div>
        </Link>
      </div>

      {address ? (
        <div className="flex items-center gap-3.5 rounded-[20px] border border-club-line bg-club-surface px-4 py-3.5">
          <IconTile className="text-club-rose">
            <MapPin size={20} />
          </IconTile>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-[15px] font-extrabold">Адрес клуба</p>
            <p className="text-[13px] leading-snug text-club-muted">{address}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "Добрый вечер" — by the club's clock, which is Moscow's. */
function greeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Moscow" }).format(now),
  );

  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}
