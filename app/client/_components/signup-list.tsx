"use client";

import Link from "next/link";
import { GlassCard } from "./ui";
import { PlayerAvatar } from "./player-avatar";
import type { SignupListEntry } from "@/lib/events/signup-list";
import { buildNicknameKey } from "@/lib/players/nickname-key";

const TICKET_LABELS: Record<string, string> = {
  duo: "1+1",
  duo_plus_one: "1+1",
  vip: "VIP",
};

function Entry({ player }: { player: SignupListEntry }) {
  const ticket = TICKET_LABELS[player.ticketType];
  // A "1+1" guest is only the name the buyer wrote down: there is no account behind it,
  // and a namesake's profile would be somebody else's.
  const profileKey = player.isGuest ? "" : buildNicknameKey(player.name);
  const rowClassName = `flex min-h-[52px] items-center gap-3 rounded-[14px] px-3 py-2 ${
    player.isMe ? "bg-club-crimson/12" : ""
  }`;
  const row = (
    <>
      <PlayerAvatar
        hand={player.hand}
        name={player.name}
        photoUrl={player.avatarUrl ?? undefined}
        size={34}
      />
      <p className="min-w-0 flex-1 truncate pl-1 text-[14px] font-bold">
        {player.name}
        {player.isGuest ? <span className="font-semibold text-club-faint"> · гость</span> : null}
      </p>
      {ticket ? (
        <span className="shrink-0 rounded-full border border-club-gold/40 px-2 py-0.5 text-[11px] font-bold text-club-gold">
          {ticket}
        </span>
      ) : null}
    </>
  );

  return (
    <li>
      {profileKey ? (
        <Link
          className={`${rowClassName} transition active:scale-[0.99]`}
          href={`/client/players/${encodeURIComponent(profileKey)}`}
        >
          {row}
        </Link>
      ) : (
        <div className={rowClassName}>{row}</div>
      )}
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
        <p className="text-sm text-club-muted">Пока никто не записался. Будьте первым.</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {players.length > 0 ? (
        <GlassCard className="!px-1 !py-1.5">
          <ul className="flex flex-col">
            {players.map((player) => (
              <Entry key={player.key} player={player} />
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {waitlist.length > 0 ? (
        <GlassCard className="!px-1 !py-1.5">
          <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">
            Лист ожидания
          </p>
          <ul className="flex flex-col">
            {waitlist.map((player) => (
              <Entry key={player.key} player={player} />
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}
