"use client";

import Link from "next/link";
import { Crosshair, Users } from "lucide-react";
import { GlassCard } from "./ui";
import { PlayerAvatar } from "./player-avatar";
import type { LiveRoom, LiveTablePlayer } from "@/lib/tables/live-tables";
import { buildNicknameKey } from "@/lib/players/nickname-key";

function PlayerRow({ justOut = false, player }: { justOut?: boolean; player: LiveTablePlayer }) {
  const out = player.status === "eliminated";
  // The desk's spelling of the name is the one the evening's results are saved under,
  // so it finds the same profile the rating and the game page open.
  const profileKey = buildNicknameKey(player.name);
  const rowClassName = `relative flex min-h-[52px] items-center gap-3 rounded-[14px] px-3.5 py-2 ${
    player.isMe ? "bg-club-crimson/12" : ""
  } ${justOut ? "client-bust client-rise" : ""}`;
  const row = (
    <>
      <span className={out ? "opacity-40 grayscale" : undefined}>
        <PlayerAvatar
          hand={player.hand}
          name={player.name}
          photoUrl={player.avatarUrl ?? undefined}
          size={34}
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-col pl-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`min-w-0 truncate text-[14px] font-bold ${out ? "text-club-faint" : ""}`}>
            {player.name}
          </span>
          {player.isMe ? (
            <span className="shrink-0 rounded-md bg-club-crimson px-1.5 py-px text-[10px] font-extrabold uppercase text-white">
              вы
            </span>
          ) : null}
        </span>
        <p className="text-[11px] text-club-faint">
          {player.registrationNumber ? `#${player.registrationNumber}` : null}
          {player.registrationNumber && player.seat ? " · " : null}
          {player.seat ? `место ${player.seat}` : null}
        </p>
      </div>

      {/* Only those who have knocked somebody out: a row of zeros at the start of the
          evening would be noise. */}
      {player.bounties ? (
        <span
          className={`flex shrink-0 items-center gap-1 text-[12px] font-extrabold text-club-gold ${
            out ? "opacity-45" : ""
          }`}
        >
          <Crosshair size={13} />
          {player.bounties.toLocaleString("ru-RU")}
          <span className="sr-only"> баунти</span>
        </span>
      ) : null}

      {out ? (
        <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-club-faint">
          вылетел
        </span>
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-club-mint" />
      )}
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
 * The room as it stands, table by table.
 *
 * A player at the club looks up from their own table to see how the others are going:
 * who is still in at table two, who has already gone out. The knocked-out are listed
 * after every table, greyed out, rather than disappearing — that is the story of the
 * evening, and the list would otherwise get shorter with nothing to show for it.
 */
export function LiveTables({
  eliminated,
  justOut,
  tables,
}: LiveRoom & {
  /** Who went out since the room was last read: they arrive in the list flashing red. */
  justOut?: ReadonlySet<string>;
}) {
  if (tables.length === 0 && eliminated.length === 0) {
    return (
      <GlassCard className="py-7 text-center">
        <p className="text-sm text-club-muted">Игроков за столами пока нет.</p>
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:items-start md:gap-4">
      {tables.map((table) => (
        <div className="rounded-[20px] border border-club-line bg-club-surface px-1 py-2" key={table.number ?? "unseated"}>
          <div className="flex items-center justify-between px-3.5 pb-2 pt-1.5">
            <p className="font-display text-[15px] font-semibold">
              {table.number ? `Стол ${table.number}` : "Без стола"}
            </p>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-club-muted">
              <Users size={13} />
              {table.players.length}
            </span>
          </div>
          <ul className="flex flex-col">
            {table.players.map((player) => (
              <PlayerRow key={player.id} player={player} />
            ))}
          </ul>
        </div>
      ))}

      {eliminated.length > 0 ? (
        <div className="rounded-[20px] border border-club-line bg-club-surface px-1 py-2">
          <div className="flex items-center justify-between px-3.5 pb-2 pt-1.5">
            <p className="font-display text-[15px] font-semibold text-club-muted">Вылетели</p>
            <span className="text-[12px] font-semibold text-club-faint">{eliminated.length}</span>
          </div>
          <ul className="flex flex-col">
            {eliminated.map((player) => (
              <PlayerRow key={player.id} justOut={justOut?.has(player.id)} player={player} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
