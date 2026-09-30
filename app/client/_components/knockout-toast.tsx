"use client";

import { useEffect } from "react";
import { Skull } from "lucide-react";
import type { LiveRoom, LiveTablePlayer } from "@/lib/tables/live-tables";

/** One knockout called out at the top of the screen. */
export type KnockoutNews = { id: string; left: number; name: string };

/** How long each knockout holds the top of the screen, its way in and out included. */
const TOAST_MS = 2_800;

/**
 * Who went out between two readings of the room. The first reading tells nobody's story
 * — the player has only just opened the screen — so it is never compared with nothing.
 */
export function findNewlyEliminated(previous: LiveRoom, next: LiveRoom): LiveTablePlayer[] {
  const known = new Set(previous.eliminated.map((player) => player.id));
  return next.eliminated.filter((player) => !known.has(player.id));
}

/** How many are still in: everybody seated at a table. */
export function countPlayersIn(room: LiveRoom) {
  return room.tables.reduce((sum, table) => sum + table.players.length, 0);
}

/**
 * The hall's knockout banner, on the phone: a player at another table goes out and the
 * screen says so for a moment, one knockout after another. It is read from the same
 * roster the screen already fetched when the count of players changed — nothing more is
 * asked of the club for it.
 */
export function KnockoutToast({ news, onDone }: { news: KnockoutNews | null; onDone: () => void }) {
  useEffect(() => {
    if (!news) return;

    const timer = window.setTimeout(onDone, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [news, onDone]);

  if (!news) return null;

  return (
    <div
      key={news.id}
      className="client-toast fixed inset-x-4 top-[calc(env(safe-area-inset-top)+58px)] z-30 mx-auto flex max-w-[420px] items-center gap-2.5 rounded-2xl border border-club-line bg-club-raised/95 px-3.5 py-3 text-[14px] font-semibold shadow-[0_14px_34px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      role="status"
    >
      <Skull className="shrink-0 text-club-rose" size={18} />
      <span className="min-w-0 truncate">
        {news.name} вылетел · осталось {news.left}
      </span>
    </div>
  );
}
