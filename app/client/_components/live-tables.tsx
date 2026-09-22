"use client";

import { Users } from "lucide-react";
import { GlassCard } from "./ui";
import { PlayerAvatar } from "./player-avatar";
import type { LiveRoom, LiveTablePlayer } from "@/lib/tables/live-tables";

function PlayerRow({ player }: { player: LiveTablePlayer }) {
  const out = player.status === "eliminated";

  return (
    <li
      className={`flex items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
        player.isMe ? "bg-[#c8163f]/15 ring-1 ring-inset ring-[#c8163f]/35" : ""
      }`}
    >
      <span className={out ? "opacity-40 grayscale" : undefined}>
        <PlayerAvatar name={player.name} photoUrl={player.avatarUrl ?? undefined} size={34} />
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

      {out ? (
        <span className="shrink-0 rounded-lg border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-white/45">
          вылетел
        </span>
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400/80" />
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
export function LiveTables({ eliminated, tables }: LiveRoom) {
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
              <PlayerRow key={player.id} player={player} />
            ))}
          </ul>
        </GlassCard>
      ) : null}
    </div>
  );
}
