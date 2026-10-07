"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardList,
  LifeBuoy,
  MapPin,
  Spade,
  Trophy,
} from "lucide-react";
import { useClientTMA } from "./layout";
import {
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
import { openSupportChat } from "./_components/support";
import { RatingRow, withOwnPhoto, type RatingPlayer } from "./_components/rating-row";
import { LiveTournamentCard } from "./_components/live-tournament-card";
import { WebAppCard } from "./_components/web-app-card";
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
    webLinked?: boolean;
    displayName: string | null;
    /** The player's own favourite hand ("QsTs"), drawn on their avatar. */
    favoriteHand?: string | null;
    profileSubmitted: boolean;
    username: string | null;
  };
};

type RatingResponse = { me: RatingPlayer; players: RatingPlayer[] };

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

  const myTier = me?.tier ?? null;
  const myPlace = me?.place ?? null;

  return (
    // On a computer the screen splits in two: the calendar on the left, the game on now,
    // the rating and the club's contacts on the right. On a phone the two columns melt
    // into one list (`contents`), and `order` puts it back in the phone's sequence.
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:gap-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1 md:flex-1 md:flex-row md:items-end md:justify-between md:gap-6">
          <h1 className="flex min-w-0 flex-col gap-1 md:flex-row md:flex-wrap md:gap-x-[0.3em] md:gap-y-0">
            <span className="text-[14px] text-club-muted md:font-display md:text-[34px] md:font-semibold md:tracking-[-0.02em] md:text-club-text">
              {greeting(new Date())},
            </span>
            <span className="truncate font-display text-[26px] font-semibold tracking-[-0.02em] md:text-[34px]">
              {playerName}
            </span>
          </h1>
          {myTier || myPlace ? (
            <div className="mt-1.5 flex gap-1.5 md:mt-0 md:shrink-0 md:gap-2.5 md:pb-1">
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
        <Link aria-label="Профиль" className="shrink-0 md:hidden" href="/client/profile">
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
        <div className="flex flex-col gap-4 rounded-[20px] border border-club-rose/45 bg-club-crimson/12 p-4 md:flex-row md:items-center md:justify-between md:px-5">
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
          <PrimaryLink
            className="md:w-auto md:shrink-0"
            href={data.player.canClaimProfile ? "/client/link" : "/client/onboarding"}
          >
            {data.player.canClaimProfile ? "Продолжить" : "Заполнить анкету"}
          </PrimaryLink>
        </div>
      ) : null}

      {/* Inside Telegram only, until the player also signs in on the web. */}
      {initData && data && !data.player.webLinked ? (
        <div className="order-3 desk:order-none">
          <WebAppCard />
        </div>
      ) : null}

      <div className="client-stagger contents desk:grid desk:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] desk:items-start desk:gap-7">
        <div className="client-stagger contents desk:flex desk:flex-col desk:gap-7">
          <div className="order-2">
            {nextEvent ? <EventCard event={nextEvent} featured /> : <NoEventsCard />}
          </div>

          {laterEvents.length > 0 ? (
            <section className="order-4 flex flex-col gap-2 md:gap-3">
              <SectionHeader href="/client/tournaments" title="Дальше в календаре" />
              <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3.5">
                {laterEvents.slice(0, 2).map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="client-stagger contents desk:flex desk:flex-col desk:gap-7">
          {live ? (
            <div className="order-1">
              <LiveTournamentCard
                href={playingEvent ? `/client/events/${playingEvent.id}` : undefined}
                live={live}
              />
            </div>
          ) : null}

          <section className="order-5 flex flex-col gap-2">
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

          <div className="order-6 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2.5 desk:grid-cols-1">
              <button
                className="flex flex-col gap-3 rounded-[20px] border border-club-line bg-club-surface p-4 text-left transition-transform active:scale-[0.98] desk:flex-row desk:items-center desk:gap-3.5"
                type="button"
                onClick={() => openSupportChat(Boolean(initData))}
              >
                <ContactIcon className="text-club-rose">
                  <LifeBuoy size={22} />
                </ContactIcon>
                <div className="flex flex-col gap-0.5 desk:flex-1">
                  <p className="text-[15px] font-extrabold">Поддержка</p>
                  <p className="text-[12px] text-club-muted desk:text-[13px]">Написать администратору</p>
                </div>
                <ChevronRight className="hidden shrink-0 text-club-faint desk:block" size={18} />
              </button>
              <Link
                className="flex flex-col gap-3 rounded-[20px] border border-club-line bg-club-surface p-4 transition-transform active:scale-[0.98] desk:flex-row desk:items-center desk:gap-3.5"
                href="/client/about"
              >
                <ContactIcon className="text-club-gold">
                  <Spade size={22} />
                </ContactIcon>
                <div className="flex flex-col gap-0.5 desk:flex-1">
                  <p className="text-[15px] font-extrabold">О клубе</p>
                  <p className="text-[12px] text-club-muted desk:text-[13px]">Majestic Poker</p>
                </div>
                <ChevronRight className="hidden shrink-0 text-club-faint desk:block" size={18} />
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
        </div>
      </div>
    </div>
  );
}

/** A bare icon on a phone's tile; on a computer's row it sits in a tile of its own. */
function ContactIcon({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span
      className={`flex shrink-0 desk:h-10 desk:w-10 desk:items-center desk:justify-center desk:rounded-xl desk:bg-club-raised ${className}`}
    >
      {children}
    </span>
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
