import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Crown, Users } from "lucide-react";
import { Eyebrow, Pill, PrimaryLink, ProgressBar } from "./ui";
import { PosterImage } from "./poster-image";
import { countAnnouncedSeats, formatSeatsTaken } from "@/lib/events/seats";
import {
  formatEventDateParts,
  formatEventShortDateLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

export type EventCardData = TournamentEvent & {
  /** What the club is waiting on this player to answer, if anything. */
  awaiting?: "duo" | "reserved" | null;
  signedUp: boolean;
  signupsCount: number;
  waitlisted?: boolean;
  /** A freed place is being held for them right now, and only for so long. */
  waitlistOffered?: boolean;
};

/** The cheapest way in tonight, for the "вход от" under the featured poster. */
function lowestBuyIn(event: EventCardData) {
  const prices = [event.buyIn, event.duoBuyIn, event.vipBuyIn].filter(
    (price): price is number => typeof price === "number" && price > 0,
  );

  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * Where the player stands on this evening, if anywhere. An invitation and a held ticket
 * both wait on the player, and both go unanswered if the card looks like any other.
 */
function EventStatus({ event }: { event: EventCardData }) {
  if (event.awaiting) {
    return (
      <Pill className="client-breathe relative" tone="gold">
        {event.awaiting === "reserved" ? "Билет отложен · подтвердите" : "Зовут в пару · подтвердите"}
      </Pill>
    );
  }

  if (event.signedUp) return <Pill tone="mint">Вы записаны</Pill>;
  if (event.waitlisted) return <Pill tone="muted">В листе ожидания</Pill>;

  return null;
}

/** A dark red plate with a spade in it, standing in for a poster the club has not drawn. */
function PosterFallback() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#3a0e1a]">
      <span aria-hidden className="absolute -right-6 -top-10 text-[240px] leading-none text-white/[0.06]">
        ♠
      </span>
    </div>
  );
}

/**
 * The next game, given the whole width: its poster, when it runs, how full it is and the
 * button to sign up.
 */
function FeaturedEventCard({ event }: { event: EventCardData }) {
  const seats = countAnnouncedSeats(event);
  const price = lowestBuyIn(event);
  const href = `/client/events/${event.id}`;

  // On a phone the name sits over the poster. On a wider screen the poster takes the left
  // half and the name heads the column beside it — the same block, placed by the grid.
  return (
    <article className="relative overflow-hidden rounded-3xl border border-club-line bg-club-surface md:grid md:grid-cols-2 md:grid-rows-[auto_1fr] md:rounded-[26px]">
      <Link className="relative block h-[168px] overflow-hidden md:row-span-2 md:h-auto md:min-h-[340px]" href={href}>
        {event.posterUrl ? <PosterImage drift url={event.posterUrl} /> : <PosterFallback />}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(13,10,11,0)_30%,rgba(13,10,11,0.88)_100%)] md:hidden" />
      </Link>

      <div className="pointer-events-none absolute inset-x-4 top-[152px] flex -translate-y-full flex-col gap-1.5 md:pointer-events-auto md:static md:translate-y-0 md:gap-[18px] md:px-7 md:pt-7">
        <Eyebrow className="!text-club-gold">Следующая игра</Eyebrow>
        <h3 className="font-display text-[24px] font-bold uppercase leading-[1.1] tracking-[-0.01em] md:text-[30px] md:leading-[1.08]">
          {event.title}
        </h3>
      </div>

      <div className="flex flex-col gap-3.5 p-4 md:gap-[18px] md:px-7 md:pb-7 md:pt-[18px]">
        <div className="flex flex-wrap gap-2">
          <Pill>
            <CalendarDays size={14} /> {formatEventShortDateLabel(event.startsAt)}
          </Pill>
          <Pill>
            <Clock size={14} /> {formatEventTimeLabel(event.startsAt)}
          </Pill>
          {event.badge ? (
            <Pill tone="gold">
              <Crown size={14} /> {event.badge}
            </Pill>
          ) : null}
          <EventStatus event={event} />
        </div>

        {seats ? (
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-[13px]">
              <span className="text-club-muted">Записались</span>
              <span className="font-bold">{formatSeatsTaken(event.signupsCount, seats.total)} мест</span>
            </div>
            <ProgressBar height={6} value={event.signupsCount / seats.total} />
          </div>
        ) : null}

        {event.waitlistOffered ? <OfferBanner href={href} /> : null}

        <div className="flex items-center gap-2.5 md:mt-auto md:gap-3.5">
          <PrimaryLink className="flex-1" href={href}>
            {event.signedUp ? "Открыть" : "Записаться"}
          </PrimaryLink>
          {price ? (
            <div className="flex flex-col items-end gap-0.5 px-1">
              <span className="text-[11px] text-club-faint">вход от</span>
              <span className="font-display text-[16px] font-semibold md:text-[17px]">
                {price.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * A freed place held for this player. The bot's message only opens the app: without
 * this the card looks like any other evening they are waiting on, and the half hour runs
 * out on the wrong screen.
 */
function OfferBanner({ href }: { href: string }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-club-line pt-3">
      <p className="text-[13px] font-bold text-club-mint">Место освободилось — держим за вами 30 минут</p>
      <PrimaryLink className="client-ring-pulse relative" href={href}>
        Записаться на освободившееся место
      </PrimaryLink>
    </div>
  );
}

/** An evening further down the calendar: a date tile, its name, how full it is. */
function EventRow({ event }: { event: EventCardData }) {
  const seats = countAnnouncedSeats(event);
  const date = formatEventDateParts(event.startsAt);
  const href = `/client/events/${event.id}`;
  const status = event.awaiting || event.signedUp || event.waitlisted || event.badge;

  // A row on a phone; on a wider screen a card in a grid, its date tile on top and the
  // poster's plate read as a line over the name.
  const row = (
    <Link className="flex gap-3.5 p-3.5 transition active:bg-white/[0.03] md:flex-1 md:flex-col md:gap-4 md:p-[18px]" href={href}>
      <div className="flex shrink-0 items-start justify-between">
        <div className="flex h-[72px] w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-club-raised">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-club-faint">{date.weekday}</span>
          <span className="font-display text-[24px] font-semibold leading-none">{date.day}</span>
          <span className="text-[11px] font-bold text-club-muted">{date.month}</span>
        </div>
        <ChevronRight className="hidden shrink-0 text-club-faint md:block" size={18} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 md:gap-4">
        <div className="flex flex-col gap-0.5 md:gap-1.5">
          <span className="hidden min-h-3.5 text-[11px] font-extrabold uppercase leading-[14px] tracking-[0.08em] text-club-gold md:block">
            {event.badge}
          </span>
          <h3 className="text-[16px] font-extrabold leading-tight md:text-[18px] md:leading-[1.25]">{event.title}</h3>
          <p className="flex items-center gap-1.5 text-[13px] text-club-muted">
            <Clock size={14} /> {formatEventTimeLabel(event.startsAt)}
            {seats ? (
              <>
                <span className="text-club-faint">·</span>
                <Users size={14} /> <span>{formatSeatsTaken(event.signupsCount, seats.total)}</span>
              </>
            ) : null}
          </p>
        </div>
        {seats ? <ProgressBar height={3} value={event.signupsCount / seats.total} /> : null}
        {/* Kept on a wide screen even when empty, so the cards of one row end level. */}
        <div className={`${status ? "flex" : "hidden md:flex"} flex-wrap gap-1.5 md:mt-auto md:min-h-7`}>
          <EventStatus event={event} />
          {event.badge ? (
            <Pill className="md:hidden" tone="gold">
              {event.badge}
            </Pill>
          ) : null}
        </div>
      </div>

      <ChevronRight className="shrink-0 self-center text-club-faint md:hidden" size={18} />
    </Link>
  );

  if (!event.waitlistOffered) {
    return (
      <article className="overflow-hidden rounded-[20px] border border-club-line bg-club-surface md:flex md:h-full md:flex-col md:rounded-[22px]">
        {row}
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-[20px] border border-club-mint/40 bg-club-surface md:flex md:h-full md:flex-col md:rounded-[22px]">
      {row}
      <div className="px-3.5 pb-3.5 md:px-[18px] md:pb-[18px]">
        <OfferBanner href={href} />
      </div>
    </article>
  );
}

/**
 * A poster in the club's calendar. The next game gets the whole card, the poster and the
 * button; the ones after it are rows with a date tile.
 */
export function EventCard({
  event,
  featured = false,
}: {
  event: EventCardData;
  featured?: boolean;
}) {
  return featured ? <FeaturedEventCard event={event} /> : <EventRow event={event} />;
}
