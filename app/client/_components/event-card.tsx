import Link from "next/link";
import { CalendarDays, Clock, Users } from "lucide-react";
import { Badge, Chip } from "./ui";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

export type EventCardData = TournamentEvent & { signedUp: boolean; signupsCount: number };

export function EventCard({
  event,
  featured = false,
}: {
  event: EventCardData;
  featured?: boolean;
}) {
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
            className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 object-contain object-right"
            src={event.posterUrl}
          />
        ) : null}

        <div className="relative max-w-[65%] space-y-3">
          <h3 className={`font-bold uppercase leading-tight ${featured ? "text-2xl" : "text-xl"}`}>
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

          <div className="flex flex-wrap items-center gap-2">
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
