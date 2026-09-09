import type { SupabaseClient } from "@supabase/supabase-js";
import { saveTournamentExtras } from "@/lib/tournament-extras";
import {
  getPlayerCategory,
  isVipRegistrationNumber,
  REGULAR_REGISTRATION_NUMBER_MAX,
  shouldTakeVipNumber,
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

/**
 * Twenty regular tickets are already out and the twenty-first has come to the door.
 *
 * Its VIP counterpart cannot happen: VIP numbers start above the regular range and run
 * on without an end.
 */
export class RegularRegistrationNumbersExhaustedError extends Error {
  constructor() {
    super("Regular registration numbers exhausted");
    this.name = "RegularRegistrationNumbersExhaustedError";
  }
}

export function isTournamentRegistrationCapacityError(error: unknown) {
  if (error instanceof TournamentRegistrationCapacityError) return true;
  if (!error || typeof error !== "object") return false;

  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("Tournament capacity reached");
}

export function isRegularRegistrationNumbersExhaustedError(error: unknown) {
  if (error instanceof RegularRegistrationNumbersExhaustedError) return true;
  if (!error || typeof error !== "object") return false;

  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("Regular registration numbers exhausted");
}

export function buildAdminRegistrationFullMessage(registeredPlayersCount: number) {
  return `Уже зарегистрировано ${registeredPlayersCount} игроков. Мест больше нет`;
}

export function buildRegularNumbersExhaustedMessage() {
  return `Обычные номера 1–${REGULAR_REGISTRATION_NUMBER_MAX} закончились. Посадите игрока по VIP-билету или освободите номер`;
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

/**
 * The next free number of the kind this player's ticket takes.
 *
 * The two ranges never meet: 1 to 20 belongs to the regular tickets and everything above
 * to the VIP ones, which is what lets the club read a ticket off a number alone. Only the
 * regular range can run out — the VIP one has no end, so a VIP guest is never turned away
 * from a chair that is standing empty.
 *
 * A number is spoken for by anyone who ever held it tonight. A player who busted an hour
 * ago is still in the draw and on the club's sheet, and so is a number handed back when a
 * ticket changed: calling two people "number 24" over one evening is worse than skipping
 * a number.
 */
export function assignRegistrationNumber(player: TournamentPlayer, players: TournamentPlayer[]) {
  const tableNumber = Math.max(1, Math.floor(Number(player.table ?? 1)));

  const usedNumbers = new Set<number>();
  for (const item of players) {
    for (const held of [item.registrationNumber, ...(item.previousRegistrationNumbers ?? [])]) {
      const value = Number(held);
      if (Number.isInteger(value) && value > 0) usedNumbers.add(value);
    }
  }

  let registrationNumber = 0;
  if (shouldTakeVipNumber(player.ticketType, tableNumber)) {
    registrationNumber = VIP_REGISTRATION_NUMBER_MIN;
    while (usedNumbers.has(registrationNumber)) registrationNumber += 1;
  } else {
    for (let candidate = 1; candidate <= REGULAR_REGISTRATION_NUMBER_MAX; candidate += 1) {
      if (usedNumbers.has(candidate)) continue;

      registrationNumber = candidate;
      break;
    }

    if (!registrationNumber) throw new RegularRegistrationNumbersExhaustedError();
  }

  return {
    ...player,
    registrationNumber,
    category: getPlayerCategory(registrationNumber),
    table: tableNumber,
  };
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
      if (isRegularRegistrationNumbersExhaustedError(error)) {
        throw new RegularRegistrationNumbersExhaustedError();
      }

      throw error;
    }

    if (data) return data as TournamentPlayer;
  } catch (error) {
    if (!isMissingAppendPlayerRpcError(error)) throw error;
  }

  const nextPlayer = assignRegistrationNumber({ ...player, table: tableNumber }, extras.players);

  await saveTournamentExtras(
    { players: [...extras.players, nextPlayer] },
    redirectTo,
    supabase,
  );

  return nextPlayer;
}

/**
 * Puts a walk-in on the roster without a chair or a number.
 *
 * The number belongs to the ticket — the club keeps everything above 20 for VIP guests —
 * and at the door nobody has asked yet which one this player wants. Handing out a regular
 * number on the way in decided that for them, and it could not be taken back.
 *
 * So they are added bare and appear on the desk's screen among those still to be seated;
 * the number is issued there, once the ticket is known.
 */
export async function appendUnseatedTournamentPlayer({
  extras,
  player,
  redirectTo,
  supabase,
}: {
  extras: TournamentExtras;
  player: TournamentPlayer;
  redirectTo: string;
  supabase: SupabaseClient;
}) {
  const { maxNumber } = getCapacity(extras.settings);

  if (extras.players.length >= maxNumber) {
    throw new TournamentRegistrationCapacityError(extras.players.length);
  }

  const persistedLabel = getPersistedPlayerLabel(extras.playerLabels, player.name);
  const seated: TournamentPlayer = {
    ...player,
    ...(persistedLabel ? { label: persistedLabel } : {}),
    registrationNumber: null,
    seat: null,
    table: null,
  };

  await saveTournamentExtras({ players: [...extras.players, seated] }, redirectTo, supabase);

  return seated;
}

/**
 * Writes the ticket the desk chose onto a player, and gives them a number if they have
 * none yet.
 *
 * Both halves matter. On an evening played without cards nothing else records the
 * ticket at all — the card RPC is what used to do it, and there is no card — so a guest
 * who asked for a VIP seat was charged for a regular one. And the number follows the
 * ticket, so it can only be handed out once the ticket is known.
 *
 * A number already given stays: it is what the club calls a player all evening, and it
 * does not change under them. Changing it is a thing the admin asks for by name —
 * `reissueRegistrationNumberForTicket` below.
 */
export async function applySeatingTicket({
  extras,
  playerId,
  redirectTo,
  supabase,
  ticketType,
}: {
  extras: TournamentExtras;
  playerId: string;
  redirectTo: string;
  supabase: SupabaseClient;
  ticketType: "regular" | "vip";
}) {
  const player = extras.players.find((item) => item.id === playerId);
  if (!player) return null;

  const withTicket = { ...player, ticketType };
  const next =
    Number(player.registrationNumber) > 0
      ? withTicket
      : assignRegistrationNumber(withTicket, extras.players);

  if (next.ticketType === player.ticketType && next.registrationNumber === player.registrationNumber) {
    return player;
  }

  await saveTournamentExtras(
    { players: extras.players.map((item) => (item.id === playerId ? next : item)) },
    redirectTo,
    supabase,
  );

  return next;
}

/**
 * Moves a player from one kind of ticket to the other and calls them by a new number.
 *
 * Only ever on the admin's say-so: a player has been announced by their number all
 * evening, so the screen asks before this runs. What it buys is the case the desk could
 * not settle otherwise — a guest upgraded to VIP mid-evening, who has to be in the VIP
 * draw and pay the VIP price, and neither follows from a number out of the regular range.
 *
 * The old number is kept on the player rather than dropped, so it is not handed to
 * somebody else an hour later.
 */
export async function reissueRegistrationNumberForTicket({
  extras,
  playerId,
  supabase,
  ticketType,
  tournamentId,
}: {
  extras: TournamentExtras;
  playerId: string;
  supabase: SupabaseClient;
  ticketType: "regular" | "vip";
  tournamentId: string;
}) {
  const player = extras.players.find((item) => item.id === playerId);
  if (!player) return null;

  const currentNumber = Number(player.registrationNumber);
  const holdsMatchingNumber =
    Number.isInteger(currentNumber) &&
    currentNumber > 0 &&
    isVipRegistrationNumber(currentNumber) === (ticketType === "vip");

  // The number already says what the ticket says: nothing to re-issue, and the player
  // keeps the number the room knows them by.
  if (holdsMatchingNumber && player.ticketType === ticketType) return player;

  let patch: Partial<TournamentPlayer> = { ticketType };
  if (!holdsMatchingNumber) {
    const previousRegistrationNumbers = [
      ...(player.previousRegistrationNumbers ?? []),
      ...(Number.isInteger(currentNumber) && currentNumber > 0 ? [currentNumber] : []),
    ];
    const next = assignRegistrationNumber(
      { ...player, previousRegistrationNumbers, ticketType },
      extras.players,
    );

    patch = {
      category: next.category,
      previousRegistrationNumbers,
      registrationNumber: next.registrationNumber,
      ticketType,
    };
  }

  // One player, patched under the row lock, rather than the whole roster written back:
  // this runs while the tournament is live, and a knockout recorded in between must not
  // be overwritten by a roster read a moment before it.
  const { data, error } = await supabase.rpc("update_tournament_player", {
    p_tournament_id: tournamentId,
    p_player_id: playerId,
    p_patch: patch,
  });

  if (error) throw error;
  return (data as TournamentPlayer | null) ?? null;
}
