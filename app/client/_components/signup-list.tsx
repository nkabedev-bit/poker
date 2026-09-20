"use client";

import { GlassCard } from "./ui";
import { PlayerAvatar } from "./player-avatar";
import type { SignupListEntry } from "@/lib/events/signup-list";

const TICKET_LABELS: Record<string, string> = {
  duo: "1+1",
  duo_plus_one: "1+1",
  vip: "VIP",
};

function Entry({ player }: { player: SignupListEntry }) {
  const ticket = TICKET_LABELS[player.ticketType];

  return (
    <li
      className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
        player.isMe ? "bg-[#c8163f]/15 ring-1 ring-inset ring-[#c8163f]/35" : ""
      }`}
    >
      <PlayerAvatar name={player.name} photoUrl={player.avatarUrl ?? undefined} size={34} />
      <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">
        {player.name}
        {player.isGuest ? <span className="text-white/35"> · гость</span> : null}
      </p>
      {ticket ? (
        <span className="shrink-0 rounded-lg border border-[#e9c07a]/35 bg-[#e9c07a]/10 px-2 py-0.5 text-[11px] font-bold text-[#e9c07a]">
          {ticket}
        </span>
      ) : null}
    </li>
  );
}

/**
 * Who is coming, with the faces the club knows them by.
 *
 * The question a player asks before deciding to come is who else will be there, and
 * until now the poster answered it with a number. The queue is listed apart: standing
 * in it is not a ticket.
 */
export function SignupList({
  players,
  waitlist = [],
}: {
  players: SignupListEntry[];
  waitlist?: SignupListEntry[];
}) {
  if (players.length === 0 && waitlist.length === 0) {
    return (
      <GlassCard className="py-7 text-center">
        <p className="text-sm text-white/45">Пока никто не записался. Будьте первым.</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      {players.length > 0 ? (
        <GlassCard className="!p-3">
          <ul className="space-y-0.5">
            {players.map((player) => (
              <Entry key={player.key} player={player} />
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {waitlist.length > 0 ? (
        <GlassCard className="!p-3">
          <p className="mb-1.5 px-1.5 text-[12px] font-bold uppercase tracking-wider text-white/35">
            Лист ожидания
          </p>
          <ul className="space-y-0.5">
            {waitlist.map((player) => (
              <Entry key={player.key} player={player} />
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}
