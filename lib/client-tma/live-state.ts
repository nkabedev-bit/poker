import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTournamentUnderway } from "@/lib/timer/calculate";
import type { TimerStatus } from "@/lib/timer/types";
import type { ClientLiveState, LiveBlindLevel } from "@/lib/client-tma/live-state-shared";

// Re-exported so a server route has one place to import the live state from.
export type { ClientLiveState, LiveBlindLevel } from "@/lib/client-tma/live-state-shared";
export { toTimerState } from "@/lib/client-tma/live-state-shared";

/**
 * How long a reading is reused for everybody.
 *
 * Twenty phones in the room ask the same question within the same few seconds, and the
 * answer is the same for all of them. One read a beat, rather than one per player: the
 * whole room costs the database what a single screen costs it, and nobody sees the
 * clock more than ten seconds stale (their own countdown runs locally anyway).
 */
const CACHE_TTL_MS = 10_000;

type CacheEntry = { readAt: number; value: ClientLiveState | null };

const cache = new Map<string, CacheEntry>();

function readCache(key: string, now: number) {
  const entry = cache.get(key);
  if (!entry || now - entry.readAt >= CACHE_TTL_MS) return undefined;

  return entry;
}

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function optionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapLevel(row: Record<string, unknown>): LiveBlindLevel {
  return {
    ante: optionalNumber(row.ante),
    bigBlind: optionalNumber(row.bigBlind),
    breakDurationSeconds: optionalNumber(row.breakDurationSeconds),
    durationSeconds: Math.max(0, Number(row.durationSeconds) || 0),
    isBreak: Boolean(row.isBreak),
    levelOrder: Number(row.levelOrder) || 0,
    smallBlind: optionalNumber(row.smallBlind),
  };
}

function mapState(row: Record<string, unknown>): ClientLiveState {
  const levels = row.blindLevels;

  return {
    activePlayers: Math.max(0, Number(row.activePlayers) || 0),
    blindLevels: Array.isArray(levels)
      ? levels.map((level) => mapLevel(level as Record<string, unknown>))
      : null,
    currentLevelIndex: Math.max(0, Number(row.currentLevelIndex) || 0),
    levelStartedAt: optionalText(row.levelStartedAt),
    levelsVersion: String(row.levelsVersion ?? ""),
    pausedRemainingSeconds: optionalNumber(row.pausedRemainingSeconds),
    registrationClosesAt: optionalText(row.registrationClosesAt),
    status: (row.status as TimerStatus) ?? "not_started",
    totalPlayers: Math.max(0, Number(row.totalPlayers) || 0),
    tournamentName: String(row.tournamentName ?? "").trim() || "Турнир",
  };
}

/**
 * The game being played right now, or null when the room is quiet.
 *
 * Null for a tournament that has not started and for one that has finished: the card
 * only ever announces a game in progress, and a phone that is told there is none stops
 * asking until the player opens the app again.
 */
export async function readClientLiveState(
  supabase: SupabaseClient,
  { includeLevels = false, now = Date.now() }: { includeLevels?: boolean; now?: number } = {},
): Promise<ClientLiveState | null> {
  const key = includeLevels ? "levels" : "state";
  const cached = readCache(key, now);
  if (cached) return cached.value;

  const { data, error } = await supabase.rpc("get_client_live_state", {
    p_include_levels: includeLevels,
  });

  if (error) throw error;

  const state = data ? mapState(data as Record<string, unknown>) : null;
  const value = state && isTournamentUnderway(state.status) ? state : null;

  cache.set(key, { readAt: now, value });
  // A reading with the levels answers a question asked without them just as well, so a
  // phone that opened the app a moment ago spares the room a second read.
  if (includeLevels && value) cache.set("state", { readAt: now, value });

  return value;
}

/** Only for the tests: the cache outlives a single request by design. */
export function clearClientLiveStateCache() {
  cache.clear();
}
