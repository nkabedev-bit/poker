import { countWord } from "@/lib/raffle/raffle-scenes";
import type { TableMove } from "@/lib/timer/types";
import {
  buildSeatingTables,
  pickRandomSeat,
  type SeatingPlayer,
  type SeatingTable,
} from "./seating";

/** A table somebody is still playing at, and how many of them. */
export type ActiveTable = { number: number; players: number };

export type TableBreakPlan =
  | { moves: TableMove[]; ok: true }
  | { ok: false; reason: "empty_table" }
  | { ok: false; reason: "no_other_tables" }
  | { free: number; needed: number; ok: false; reason: "not_enough_seats"; tables: number[] };

function readTableNumber(value: unknown) {
  const table = Number(value);
  return Number.isInteger(table) && table > 0 ? table : null;
}

/**
 * The tables the desk can choose to break: every one with somebody still playing at it,
 * in their own order. A player who has not been given a chair yet still belongs to the
 * table they were sent to.
 */
export function listActiveTables(players: SeatingPlayer[]): ActiveTable[] {
  const counts = new Map<number, number>();

  for (const player of players) {
    if (player.status !== "active") continue;

    const table = readTableNumber(player.table);
    if (table === null) continue;

    counts.set(table, (counts.get(table) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([number, count]) => ({ number, players: count }))
    .sort((a, b) => a.number - b.number);
}

/** How many players sit at a table right now. */
function countSeated(table: SeatingTable) {
  return table.seats.filter((seat) => seat.player !== null).length;
}

/** A shuffled copy: who is sat down first decides nothing, so nobody is always first. */
function shuffle<T>(items: T[], random: () => number) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.min(index, Math.floor(random() * (index + 1)));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }

  return shuffled;
}

/**
 * Where everybody at a table goes when the desk breaks it up.
 *
 * The players are drawn one by one in no particular order, and each goes to whichever
 * table still in play has the fewest players — a tie is left to the draw — so the room
 * comes out as even as the tables allow: five and three with four to place end up six
 * and six. At that table the chair is the one farthest from anybody already sitting
 * there, the same way a walk-in is seated, so the newcomers spread round the felt.
 *
 * Only tables somebody is playing at take anybody: an empty table stays empty. Tickets
 * are not looked at — once tables are merged a VIP holder may sit anywhere, and the
 * number they are called by stays with them.
 */
export function planTableBreak({
  formats,
  players,
  random = Math.random,
  table,
  tablesCount,
}: {
  formats: number | readonly number[] | null | undefined;
  players: SeatingPlayer[];
  random?: () => number;
  table: number;
  tablesCount: number;
}): TableBreakPlan {
  const movers = players.filter(
    (player) => player.status === "active" && readTableNumber(player.table) === table,
  );
  if (movers.length === 0) return { ok: false, reason: "empty_table" };

  // Copies the draw can fill in as it goes: each chair taken counts for the next player.
  const destinations = buildSeatingTables(players, tablesCount, formats)
    .filter((candidate) => candidate.number !== table && countSeated(candidate) > 0)
    .map((candidate) => ({
      ...candidate,
      // Every table is one kind here, so the draw looks at them all alike.
      isVip: false,
      seats: candidate.seats.map((seat) => ({ ...seat })),
    }));
  if (destinations.length === 0) return { ok: false, reason: "no_other_tables" };

  const free = destinations.reduce(
    (total, candidate) => total + candidate.seats.length - countSeated(candidate),
    0,
  );
  const shortOfSeats: TableBreakPlan = {
    free,
    needed: movers.length,
    ok: false,
    reason: "not_enough_seats",
    tables: destinations.map((candidate) => candidate.number),
  };
  if (free < movers.length) return shortOfSeats;

  const moves: TableMove[] = [];

  for (const mover of shuffle(movers, random)) {
    const chosen = pickRandomSeat(destinations, "regular", random);
    // Counted above, so there is always a chair; this only keeps a bad count honest.
    if (!chosen) return shortOfSeats;

    const seat = destinations
      .find((candidate) => candidate.number === chosen.table)
      ?.seats.find((candidate) => candidate.seat === chosen.seat);
    if (!seat) throw new Error(`Seat ${chosen.seat} at table ${chosen.table} is not on the plan`);

    seat.player = {
      id: mover.id,
      name: mover.name,
      registrationNumber: mover.registrationNumber ?? null,
    };
    moves.push({
      name: mover.name,
      playerId: mover.id,
      seat: chosen.seat,
      seatLabel: seat.label,
      table: chosen.table,
    });
  }

  return {
    moves: moves.sort((a, b) => a.table - b.table || a.seat - b.seat),
    ok: true,
  };
}

/** "1", "1 и 2", "1, 2 и 4" — tables the way the desk says them. */
function joinTableNumbers(tables: number[]) {
  if (tables.length < 2) return tables.join("");

  return `${tables.slice(0, -1).join(", ")} и ${tables[tables.length - 1]}`;
}

/** Why a table could not be broken, in words the desk can act on. */
export function describeTableBreakRefusal(
  plan: Exclude<TableBreakPlan, { ok: true }>,
  table: number,
) {
  if (plan.reason === "empty_table") {
    return `За столом ${table} никто не играет — расформировывать нечего.`;
  }
  if (plan.reason === "no_other_tables") {
    return `Кроме стола ${table}, играющих столов нет — пересаживать некуда.`;
  }

  const where =
    plan.tables.length === 1
      ? `за столом ${plan.tables[0]}`
      : `за столами ${joinTableNumbers(plan.tables)}`;
  const room =
    plan.free === 0
      ? "свободных мест нет"
      : `свободно ${countWord(plan.free, ["место", "места", "мест"])}`;
  const playing = `${plan.needed === 1 ? "играет" : "играют"} ${countWord(plan.needed, [
    "игрок",
    "игрока",
    "игроков",
  ])}`;

  return (
    `Не хватает мест: ${where} ${room}, а за столом ${table} ${playing}. ` +
    "Добавьте места (+ место) на экране «Игроки» и попробуйте ещё раз."
  );
}
