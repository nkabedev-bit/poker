import type { SupabaseClient } from "@supabase/supabase-js";
import { saveTournamentExtras } from "@/lib/tournament-extras";
import { REGISTRATION_NUMBERS_PER_EVENING } from "@/lib/player-registration-number";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import { countSeats, readTableFormats, SEATS_PER_TABLE } from "@/lib/tables/seating";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

/**
 * Nobody more can be added right now: every chair is taken ("chairs"), or the evening has
 * handed out all its numbers ("evening") — and then no chair coming free will help.
 */
export class TournamentRegistrationCapacityError extends Error {
  reason: "chairs" | "evening";
  registeredPlayersCount: number;

  constructor(registeredPlayersCount: number, reason: "chairs" | "evening" = "chairs") {
    super(`Tournament capacity reached: ${registeredPlayersCount} players registered`);
    this.name = "TournamentRegistrationCapacityError";
    this.reason = reason;
    this.registeredPlayersCount = registeredPlayersCount;
  }
}

/** The evening's numbers — 1–40 — are all spoken for. */
export class RegistrationNumbersExhaustedError extends Error {
  constructor() {
    super("Registration numbers exhausted");
    this.name = "RegistrationNumbersExhaustedError";
  }
}

export function isTournamentRegistrationCapacityError(error: unknown) {
  if (error instanceof TournamentRegistrationCapacityError) return true;
  if (!error || typeof error !== "object") return false;

  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("Tournament capacity reached");
}

/**
 * The evening's numbers have run out. The database said so in other words before
 * 19.10.2026 ("Regular registration numbers exhausted"), and both are read the same.
 */
export function isRegistrationNumbersExhaustedError(error: unknown) {
  if (error instanceof RegistrationNumbersExhaustedError) return true;
  if (!error || typeof error !== "object") return false;

  const message = String((error as { message?: unknown }).message ?? "");
  return message.toLowerCase().includes("registration numbers exhausted");
}

export function buildAdminRegistrationFullMessage(registeredPlayersCount: number) {
  return `За столами уже ${registeredPlayersCount} игроков — свободных мест нет. Добавьте место за одним из столов`;
}

/**
 * What the desk is told when nobody more can be added: a full evening says so, rather
 * than sending the admin to add a chair that would not help.
 */
export function buildRegistrationFullMessage(error: unknown, seatedCount: number) {
  if (error instanceof TournamentRegistrationCapacityError && error.reason === "evening") {
    return `За вечер уже ${REGISTRATION_NUMBERS_PER_EVENING} игроков — номеров больше нет`;
  }

  return buildAdminRegistrationFullMessage(seatedCount);
}

/** What the desk is told when the evening's numbers have run out. */
export function buildNumbersExhaustedMessage() {
  return `Номера 1–${REGISTRATION_NUMBERS_PER_EVENING} закончились. Освободите номер, чтобы посадить игрока`;
}

/**
 * Whether the room can take one more player right now.
 *
 * The chairs are the ones standing at the tables tonight, in each table's own format, and
 * they are counted against the players sitting in them. Somebody who busted has left their
 * chair to the next walk-in, and a walk-in still waiting to be seated has not taken one yet:
 * their chair is checked when they are sat down, so they cannot turn away a player who is
 * being given the chair that is still free. The roster itself stops at the evening's
 * numbers — forty, everybody who played tonight included — the same ceiling the database
 * keeps.
 */
function getCapacity(extras: TournamentExtras) {
  const tablesCount = Math.max(1, Math.floor(Number(extras.settings.tablesCount ?? 1)));
  const seats = countSeats(
    readTableFormats(extras.settings.maxPlayersPerTable, extras.tableFormats, tablesCount),
  );
  const seatedCount = extras.players.filter(
    (player) => player.status === "active" && Boolean(player.table) && Boolean(player.seat),
  ).length;
  const eveningFull = extras.players.length >= REGISTRATION_NUMBERS_PER_EVENING;

  return {
    full: eveningFull || seatedCount >= seats,
    reason: eveningFull ? ("evening" as const) : ("chairs" as const),
    seatedCount,
    tablesCount,
  };
}

/** The first number of the evening that nobody holds tonight — or 0. */
function firstFreeNumber(used: Set<number>) {
  for (let candidate = 1; candidate <= REGISTRATION_NUMBERS_PER_EVENING; candidate += 1) {
    if (!used.has(candidate)) return candidate;
  }

  return 0;
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
 * The next free number of the evening: 1–40 in the order players are seated, and the
 * evening holds no more players than that.
 *
 * A number is spoken for by anyone who ever held it tonight. A player who busted an hour
 * ago is still in the draw and on the club's sheet, and so is a number handed back before:
 * calling two people "number 24" over one evening is worse than skipping a number.
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

  const registrationNumber = firstFreeNumber(usedNumbers);
  if (!registrationNumber) throw new RegistrationNumbersExhaustedError();

  return {
    ...player,
    registrationNumber,
    table: tableNumber,
  };
}

/**
 * Раздвигает уже выданные места, когда турнир принимает опоздавшего.
 *
 * Место за вылет — это число игроков, ещё стоявших за столами. Пока ростер не растёт,
 * лестница идёт вниз без пропусков: 24, 23, 22… Игрок, пришедший после того, как кто-то
 * уже вылетел, добавляет в вечер человека, которого те вылеты не считали: каждого из них
 * обошли на одного больше, и их места сдвигаются на шаг вниз таблицы.
 *
 * Без этого следующий вылет метит в место, которое уже занято, и запись вылета уводит
 * игрока в первый свободный слот — на самое дно таблицы. Так 15.09.2026 Vera получила
 * 25-е место вместо 17-го: опоздавший сел за стол между её вылетом и предыдущим.
 *
 * Победителя это не касается: первое место выдаётся только вместе с концом турнира, и
 * дописывать игроков в законченную игру уже нечего.
 */
export function shiftFinishPlacesForLateRegistration(players: TournamentPlayer[]) {
  const places = players
    .map((player) => Number(player.finishPlace))
    .filter((place) => Number.isInteger(place) && place > 0);

  if (places.length === 0 || places.includes(1)) return players;

  return players.map((player) =>
    Number.isInteger(player.finishPlace) && Number(player.finishPlace) > 0
      ? { ...player, finishPlace: Number(player.finishPlace) + 1 }
      : player,
  );
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
  const { full, reason, seatedCount, tablesCount } = getCapacity(extras);
  const tableNumber = Math.max(1, Math.floor(Number(player.table ?? 1)));

  if (full) {
    throw new TournamentRegistrationCapacityError(seatedCount, reason);
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
      // The database keeps only the evening's ceiling — its forty numbers — and no longer
      // reads these two; they stay for the function's signature. The chairs actually
      // standing at the tables were counted above.
      p_tables_count: tablesCount,
      p_max_players_per_table: SEATS_PER_TABLE,
    });

    if (error) {
      if (isMissingAppendPlayerRpcError(error)) throw error;
      if (isTournamentRegistrationCapacityError(error)) {
        throw new TournamentRegistrationCapacityError(
          getRegisteredPlayersCountFromError(error, extras.players.length),
          "evening",
        );
      }
      if (isRegistrationNumbersExhaustedError(error)) {
        throw new RegistrationNumbersExhaustedError();
      }

      throw error;
    }

    if (data) return data as TournamentPlayer;
  } catch (error) {
    if (!isMissingAppendPlayerRpcError(error)) throw error;
  }

  const nextPlayer = assignRegistrationNumber({ ...player, table: tableNumber }, extras.players);

  await saveTournamentExtras(
    { players: [...shiftFinishPlacesForLateRegistration(extras.players), nextPlayer] },
    redirectTo,
    supabase,
  );

  return nextPlayer;
}

/**
 * Puts a walk-in on the roster without a chair or a number.
 *
 * They are added bare and appear on the desk's screen among those still to be seated;
 * the number is issued there, in the order players actually sit down.
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
  const { full, reason, seatedCount } = getCapacity(extras);

  if (full) {
    throw new TournamentRegistrationCapacityError(seatedCount, reason);
  }

  const persistedLabel = getPersistedPlayerLabel(extras.playerLabels, player.name);
  const seated: TournamentPlayer = {
    ...player,
    ...(persistedLabel ? { label: persistedLabel } : {}),
    registrationNumber: null,
    seat: null,
    table: null,
  };

  await saveTournamentExtras(
    { players: [...shiftFinishPlacesForLateRegistration(extras.players), seated] },
    redirectTo,
    supabase,
  );

  return seated;
}

/**
 * Gives a player the desk has just sat down a number, if they have none yet.
 *
 * A walk-in typed in at the door goes on the roster without one and gets theirs here.
 * A number already given stays — it is what the club calls a player all evening, and it
 * does not change under them.
 */
export async function ensureRegistrationNumber({
  extras,
  playerId,
  supabase,
  tournamentId,
}: {
  extras: TournamentExtras;
  playerId: string;
  supabase: SupabaseClient;
  tournamentId: string;
}) {
  const player = extras.players.find((item) => item.id === playerId);
  if (!player) return null;
  if (Number(player.registrationNumber) > 0) return player;

  const { registrationNumber } = assignRegistrationNumber(player, extras.players);

  // One player, patched under the row lock, rather than the whole roster written back:
  // this runs while the tournament is live, and a knockout recorded in between must not
  // be overwritten by a roster read a moment before it.
  const { data, error } = await supabase.rpc("update_tournament_player", {
    p_tournament_id: tournamentId,
    p_player_id: playerId,
    p_patch: { registrationNumber },
  });

  if (error) throw error;
  return (data as TournamentPlayer | null) ?? null;
}
