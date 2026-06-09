import type { SupabaseClient } from "@supabase/supabase-js";
import { saveTournamentExtras } from "@/lib/tournament-extras";
import {
  getPlayerCategory,
  VIP_REGISTRATION_NUMBER_MAX,
  VIP_REGISTRATION_NUMBER_MIN,
} from "@/lib/player-registration-number";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

export class TournamentRegistrationCapacityError extends Error {
  registeredPlayersCount: number;

  constructor(registeredPlayersCount: number) {
    super(`Tournament capacity reached: ${registeredPlayersCount} players registered`);
    this.name = "TournamentRegistrationCapacityError";
    this.registeredPlayersCount = registeredPlayersCount;
  }
}

export function isTournamentRegistrationCapacityError(error: unknown) {
  if (error instanceof TournamentRegistrationCapacityError) return true;
  if (!error || typeof error !== "object") return false;

  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("Tournament capacity reached");
}

export function buildAdminRegistrationFullMessage(registeredPlayersCount: number) {
  return `Уже зарегистрировано ${registeredPlayersCount} игроков. Мест больше нет`;
}

function getCapacity(settings: TournamentExtras["settings"]) {
  const tablesCount = Math.max(1, Math.floor(Number(settings.tablesCount ?? 1)));
  const maxPlayersPerTable = Math.max(1, Math.floor(Number(settings.maxPlayersPerTable ?? 1)));

  return {
    maxNumber: tablesCount * maxPlayersPerTable,
    maxPlayersPerTable,
    tablesCount,
  };
}

function getRegisteredPlayersCountFromError(error: unknown, fallback: number) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/Tournament capacity reached:\s*(\d+)\s+players registered/i);
  return match ? Number(match[1]) : fallback;
}

function isMissingAppendPlayerRpcError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "PGRST202" || String(message ?? "").includes("Could not find the function public.append_tournament_player");
}

function assignRegistrationNumber(
  player: TournamentPlayer,
  players: TournamentPlayer[],
  settings: TournamentExtras["settings"],
) {
  const { maxNumber } = getCapacity(settings);
  const tableNumber = Math.max(1, Math.floor(Number(player.table ?? 1)));
  const usedNumbers = new Set(
    players
      .map((item) => Number(item.registrationNumber))
      .filter((value) => Number.isInteger(value) && value > 0),
  );

  for (let candidate = 1; candidate <= maxNumber; candidate += 1) {
    if (tableNumber === 3) {
      if (candidate < VIP_REGISTRATION_NUMBER_MIN || candidate > VIP_REGISTRATION_NUMBER_MAX) {
        continue;
      }
    } else if (
      candidate >= VIP_REGISTRATION_NUMBER_MIN &&
      candidate <= VIP_REGISTRATION_NUMBER_MAX
    ) {
      continue;
    }

    if (!usedNumbers.has(candidate)) {
      return {
        ...player,
        registrationNumber: candidate,
        category: getPlayerCategory(candidate),
        table: tableNumber,
      };
    }
  }

  throw new Error("No registration numbers available");
}

export async function appendTournamentPlayerWithRegistrationNumber({
  extras,
  player,
  redirectTo,
  supabase,
  tournamentId,
}: {
  extras: TournamentExtras;
  player: TournamentPlayer;
  publicToken: string;
  redirectTo: string;
  supabase: SupabaseClient;
  tournamentId: string;
}) {
  const { maxNumber, maxPlayersPerTable, tablesCount } = getCapacity(extras.settings);
  const tableNumber = Math.max(1, Math.floor(Number(player.table ?? 1)));

  if (extras.players.length >= maxNumber) {
    throw new TournamentRegistrationCapacityError(extras.players.length);
  }

  // Re-apply a persistent per-guest display label (matched by nickname) so regular
  // guests (e.g. dealers) keep their marker across games without re-issuing /givecolor.
  const persistedLabel = getPersistedPlayerLabel(extras.playerLabels, player.name);
  if (persistedLabel) {
    player = { ...player, label: persistedLabel };
  }

  try {
    const { data, error } = await supabase.rpc("append_tournament_player", {
      p_tournament_id: tournamentId,
      p_player: player,
      p_table_number: tableNumber,
      p_tables_count: tablesCount,
      p_max_players_per_table: maxPlayersPerTable,
    });

    if (error) {
      if (isMissingAppendPlayerRpcError(error)) throw error;
      if (isTournamentRegistrationCapacityError(error)) {
        throw new TournamentRegistrationCapacityError(
          getRegisteredPlayersCountFromError(error, extras.players.length),
        );
      }

      throw error;
    }

    if (data) return data as TournamentPlayer;
  } catch (error) {
    if (!isMissingAppendPlayerRpcError(error)) throw error;
  }

  const nextPlayer = assignRegistrationNumber(
    { ...player, table: tableNumber },
    extras.players,
    extras.settings,
  );

  await saveTournamentExtras(
    { players: [...extras.players, nextPlayer] },
    redirectTo,
    supabase,
  );

  return nextPlayer;
}
