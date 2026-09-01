import Link from "next/link";
import { CalendarDays, Clock, Users } from "lucide-react";
import { Badge, Chip } from "./ui";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

export type EventCardData = TournamentEvent & { signedUp: boolean; signupsCount: number };

/**
 * The poster fills the card and the text sits in a dark gradient over it — the artwork
 * is the point of an afisha, so it gets the whole surface rather than a corner.
 */
export function EventCard({
  event,
  featured = false,
}: {
  event: EventCardData;
  featured?: boolean;
}) {
  return (
    <Link className="block active:scale-[0.99] transition-transform" href={`/client/events/${event.id}`}>
      <article
        className={`relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#1a0b10] shadow-[0_12px_36px_rgba(0,0,0,0.5)] ${
          featured ? "min-h-[196px]" : "min-h-[168px]"
        }`}
      >
        {event.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            src={event.posterUrl}
          />
        ) : (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#4a0f1e] via-[#20080e] to-[#0a0608]" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(6,3,4,0.95)_0%,rgba(6,3,4,0.86)_38%,rgba(6,3,4,0.35)_72%,rgba(6,3,4,0.1)_100%)]" />

        <div className={`relative flex h-full flex-col gap-3 ${featured ? "p-5" : "p-4"}`}>
          <h3
            className={`max-w-[70%] font-extrabold uppercase leading-[1.05] tracking-tight ${
              featured ? "text-[26px]" : "text-[21px]"
            }`}
          >
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
                <Users size={13} /> {event.maxPlayers}
              </Chip>
            ) : null}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {event.badge ? <Badge>{event.badge}</Badge> : null}
            {event.signedUp ? (
              <span className="inline-flex items-center rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[12px] font-bold text-emerald-300">
                Вы записаны
              </span>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  );
}
