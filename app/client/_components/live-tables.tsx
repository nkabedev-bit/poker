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
  const rowClassName = `relative flex items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
    player.isMe ? "bg-[#c8163f]/15 ring-1 ring-inset ring-[#c8163f]/35" : ""
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

      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] font-semibold ${out ? "text-white/40" : ""}`}>
          {player.name}
        </p>
        <p className="text-[11px] text-white/35">
          {player.registrationNumber ? `#${player.registrationNumber}` : null}
          {player.registrationNumber && player.seat ? " · " : null}
          {player.seat ? `место ${player.seat}` : null}
        </p>
      </div>

      {/* Only those who have knocked somebody out: a row of zeros at the start of the
          evening would be noise. */}
      {player.bounties ? (
        <span
          className={`flex shrink-0 items-center gap-1 text-[13px] font-bold text-[#e9c07a] ${
            out ? "opacity-45" : ""
          }`}
        >
          <Crosshair size={13} />
          {player.bounties.toLocaleString("ru-RU")}
          <span className="sr-only"> баунти</span>
        </span>
      ) : null}

      {out ? (
        <span className="shrink-0 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-white/45">
          вылетел
        </span>
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400/80" />
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
        <p className="text-sm text-white/45">Игроков за столами пока нет.</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-3">
      {tables.map((table) => (
        <GlassCard className="!p-3" key={table.number ?? "unseated"}>
          <div className="mb-1.5 flex items-center justify-between px-1.5">
            <p className="text-[15px] font-bold tracking-tight">
              {table.number ? `Стол ${table.number}` : "Без стола"}
            </p>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-white/40">
              <Users size={13} />
              {table.players.length}
            </span>
          </div>
          <ul className="space-y-0.5">
            {table.players.map((player) => (
              <PlayerRow key={player.id} player={player} />
            ))}
          </ul>
        </GlassCard>
      ))}

      {eliminated.length > 0 ? (
        <GlassCard className="!p-3">
          <div className="mb-1.5 flex items-center justify-between px-1.5">
            <p className="text-[15px] font-bold tracking-tight text-white/45">Вылетели</p>
            <span className="text-[12px] font-semibold text-white/35">{eliminated.length}</span>
          </div>
          <ul className="space-y-0.5">
            {eliminated.map((player) => (
              <PlayerRow key={player.id} justOut={justOut?.has(player.id)} player={player} />
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}
