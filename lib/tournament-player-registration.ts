import type { SupabaseClient } from "@supabase/supabase-js";
import { saveTournamentExtras } from "@/lib/tournament-extras";
import {
  getPlayerCategory,
  isVipRegistrationNumber,
  REGISTRATION_NUMBERS_PER_EVENING,
  REGULAR_REGISTRATION_NUMBER_RANGES,
  shouldTakeVipNumber,
  VIP_REGISTRATION_NUMBER_RANGE,
} from "@/lib/player-registration-number";
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

/** The evening's regular numbers — 1–20 and 36–40 — are all spoken for. */
export class RegularRegistrationNumbersExhaustedError extends Error {
  constructor() {
    super("Regular registration numbers exhausted");
    this.name = "RegularRegistrationNumbersExhaustedError";
  }
}

/** The evening's VIP numbers — 21–35 — are all spoken for. */
export class VipRegistrationNumbersExhaustedError extends Error {
  constructor() {
    super("VIP registration numbers exhausted");
    this.name = "VipRegistrationNumbersExhaustedError";
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

export function isVipRegistrationNumbersExhaustedError(error: unknown) {
  if (error instanceof VipRegistrationNumbersExhaustedError) return true;
  if (!error || typeof error !== "object") return false;

  const message = String((error as { message?: unknown }).message ?? "");
  return message.includes("VIP registration numbers exhausted");
}

/** The numbers of the ticket asked for have run out, whichever ticket that was. */
export function isRegistrationNumbersExhaustedError(error: unknown) {
  return (
    isRegularRegistrationNumbersExhaustedError(error) ||
    isVipRegistrationNumbersExhaustedError(error)
  );
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

function formatNumberRange([from, to]: readonly [number, number]) {
  return `${from}–${to}`;
}

/** What the desk is told when the numbers of the ticket it asked for have run out. */
export function buildNumbersExhaustedMessage(error: unknown) {
  if (isVipRegistrationNumbersExhaustedError(error)) {
    return `VIP-номера ${formatNumberRange(VIP_REGISTRATION_NUMBER_RANGE)} закончились. Посадите игрока по обычному билету или освободите номер`;
  }

  const regular = REGULAR_REGISTRATION_NUMBER_RANGES.map(formatNumberRange).join(" и ");
  return `Обычные номера ${regular} закончились. Посадите игрока по VIP-билету или освободите номер`;
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

/** The first number of `ranges`, in their order, that nobody holds tonight — or 0. */
function firstFreeNumber(ranges: ReadonlyArray<readonly [number, number]>, used: Set<number>) {
  for (const [from, to] of ranges) {
    for (let candidate = from; candidate <= to; candidate += 1) {
      if (!used.has(candidate)) return candidate;
    }
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
 * The next free number of the kind this player's ticket takes.
 *
 * The ranges never meet: 1–20 and then 36–40 belong to the regular tickets, 21–35 to the
 * VIP ones, which is what lets the club read a ticket off a number alone. Forty numbers in
 * all, and the evening holds no more players than that.
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
    registrationNumber = firstFreeNumber([VIP_REGISTRATION_NUMBER_RANGE], usedNumbers);
    if (!registrationNumber) throw new VipRegistrationNumbersExhaustedError();
  } else {
    registrationNumber = firstFreeNumber(REGULAR_REGISTRATION_NUMBER_RANGES, usedNumbers);
    if (!registrationNumber) throw new RegularRegistrationNumbersExhaustedError();
  }

  return {
    ...player,
    registrationNumber,
    category: getPlayerCategory(registrationNumber),
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
      if (isRegularRegistrationNumbersExhaustedError(error)) {
        throw new RegularRegistrationNumbersExhaustedError();
      }
      if (isVipRegistrationNumbersExhaustedError(error)) {
        throw new VipRegistrationNumbersExhaustedError();
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
 * The number belongs to the ticket — the club keeps 21–35 for VIP guests —
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
