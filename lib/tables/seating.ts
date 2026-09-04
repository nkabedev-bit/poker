import type { TournamentPlayer } from "@/lib/timer/types";

/** Every table in the club seats ten. */
export const SEATS_PER_TABLE = 10;

export type SeatOccupant = { id: string; name: string; registrationNumber: number | null };

export type TableSeat = { player: SeatOccupant | null; seat: number };

export type SeatingTable = { isVip: boolean; number: number; seats: TableSeat[] };

/**
 * The VIP table is the last one the club opens — with a single table there is no VIP
 * seating to speak of.
 */
export function isVipTable(tableNumber: number, tablesCount: number) {
  return tablesCount > 1 && tableNumber === tablesCount;
}

/**
 * The room as the admin sees it at the door: every table, every seat, and who is in it.
 *
 * Only players still in the tournament hold a seat — someone knocked out has left the
 * chair for the next walk-in.
 */
export function buildSeatingTables(
  players: Array<
    Pick<TournamentPlayer, "id" | "name" | "status"> & {
      registrationNumber?: number | null;
      seat?: number | null;
      table?: number | null;
    }
  >,
  tablesCount: number,
): SeatingTable[] {
  const tables = Math.max(1, Math.trunc(tablesCount) || 1);
  const seated = new Map<string, SeatOccupant>();

  for (const player of players) {
    if (player.status !== "active") continue;
    if (!player.table || !player.seat) continue;

    seated.set(`${player.table}:${player.seat}`, {
      id: player.id,
      name: player.name,
      registrationNumber: player.registrationNumber ?? null,
    });
  }

  return Array.from({ length: tables }, (_, tableIndex) => {
    const number = tableIndex + 1;

    return {
      isVip: isVipTable(number, tables),
      number,
      seats: Array.from({ length: SEATS_PER_TABLE }, (_, seatIndex) => {
        const seat = seatIndex + 1;
        return { player: seated.get(`${number}:${seat}`) ?? null, seat };
      }),
    };
  });
}

/**
 * The free seats a ticket may be given: a VIP ticket belongs at the VIP table, a
 * regular one at the regular tables, and the two are never mixed.
 */
export function listFreeSeats(tables: SeatingTable[], ticket: "regular" | "vip") {
  return tables
    .filter((table) => table.isVip === (ticket === "vip"))
    .flatMap((table) =>
      table.seats
        .filter((seat) => seat.player === null)
        .map((seat) => ({ seat: seat.seat, table: table.number })),
    );
}

/**
 * A seat drawn for a player who did not choose one.
 *
 * The draw is made among the emptiest tables this ticket may sit at, and only then
 * among their free chairs: drawing from every free chair at once fills the first table
 * to the brim before the second one is touched, because the emptiest table always has
 * the fewest chairs to be drawn.
 */
export function pickRandomSeat(
  tables: SeatingTable[],
  ticket: "regular" | "vip",
  random: () => number = Math.random,
) {
  const allowed = tables.filter((table) => table.isVip === (ticket === "vip"));
  const withRoom = allowed.filter((table) => table.seats.some((seat) => seat.player === null));
  if (withRoom.length === 0) return null;

  const fewestPlayers = Math.min(
    ...withRoom.map((table) => table.seats.filter((seat) => seat.player !== null).length),
  );
  const emptiest = withRoom.filter(
    (table) => table.seats.filter((seat) => seat.player !== null).length === fewestPlayers,
  );

  const table = emptiest[Math.min(emptiest.length - 1, Math.floor(random() * emptiest.length))];
  const free = table.seats.filter((seat) => seat.player === null);
  const seat = free[Math.min(free.length - 1, Math.floor(random() * free.length))];

  return { seat: seat.seat, table: table.number };
}

/** Where a seat sits on the oval, as percentages of the table's box. */
export function getSeatPosition(seatIndex: number, seatsCount: number) {
  // Seat 1 starts at the bottom of the table and the rest run clockwise, the way a
  // dealer counts them.
  const angle = (seatIndex / seatsCount) * 2 * Math.PI + Math.PI / 2;

  // The chair is 38px across, so the ring is drawn a little inside the box and the top
  // and bottom seats stay whole.
  return {
    left: 50 + 46 * Math.cos(angle),
    top: 50 + 40 * Math.sin(angle),
  };
}
