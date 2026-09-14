import type { TournamentPlayer } from "@/lib/timer/types";

/**
 * How many places a table has, and how many chairs it gets when nobody says otherwise.
 *
 * The club's tables are dealt ten-handed at most. The admin sets how many chairs stand at
 * them tonight in the tournament settings, and the desk can bring one more or take one
 * away while the room is being seated.
 */
export const SEATS_PER_TABLE = 10;

/**
 * The formats a table is dealt in, each the one before it with chairs brought over.
 *
 * Short-handed, the chairs are spread round the felt rather than pushed together: at six
 * and seven one chair stands between places 2 and 3 and another between 7 and 8, and each
 * is called by both numbers.
 */
export const TABLE_FORMATS = [6, 7, 9, 10] as const;

/** The places with a chair at a short-handed table; every other table runs 1 to N. */
const SPREAD_FORMAT_SEATS: Record<number, readonly number[]> = {
  6: [1, 2, 4, 6, 7, 9],
  7: [1, 2, 4, 5, 6, 7, 9],
};

/** Places round the table, the dealer's among them. */
const PLACES_AROUND = SEATS_PER_TABLE + 1;

/** The chairs a table is set for: one to ten, and ten when nothing sensible is given. */
export function readTableFormat(value?: number | null) {
  const seats = Math.trunc(Number(value));
  return Number.isFinite(seats) && seats > 0 ? Math.min(seats, SEATS_PER_TABLE) : SEATS_PER_TABLE;
}

/** The places a table of this format has chairs at, in order round the table. */
export function seatsOfFormat(format: number): number[] {
  const spread = SPREAD_FORMAT_SEATS[format];
  if (spread) return [...spread];

  return Array.from({ length: readTableFormat(format) }, (_, index) => index + 1);
}

/** Whether this chair stands between two places, the way a short-handed table sets them. */
function standsBetweenPlaces(seat: number, format: number) {
  return Boolean(SPREAD_FORMAT_SEATS[format]) && (seat === 2 || seat === 7);
}

/** What the dealer calls a chair: one standing between two places goes by both numbers. */
export function seatLabel(seat: number, format: number) {
  return standsBetweenPlaces(seat, format) ? `${seat}/${seat + 1}` : String(seat);
}

function formatOfTable(formats: number | readonly number[] | null | undefined, table: number) {
  if (typeof formats === "number" || formats === null || formats === undefined) {
    return readTableFormat(formats);
  }

  return readTableFormat(formats[table - 1]);
}

/** A chair as the desk reads it out, at the format its table is dealt in tonight. */
export function nameSeat(
  formats: number | readonly number[] | null | undefined,
  table: number,
  seat: number,
) {
  return seatLabel(seat, formatOfTable(formats, table));
}

/**
 * The format a table goes up to when a chair is brought over: every chair already there
 * keeps its place. Null for a table dealt ten-handed.
 */
export function nextTableFormat(format: number): number | null {
  const seats = seatsOfFormat(format);

  return (
    TABLE_FORMATS.find(
      (candidate) =>
        candidate > format && seats.every((seat) => seatsOfFormat(candidate).includes(seat)),
    ) ?? null
  );
}

/**
 * The format a table goes down to when a chair is taken away: chairs go, nobody's place
 * moves. Null at six, or for a count of chairs no smaller format fits inside.
 */
export function previousTableFormat(format: number): number | null {
  const seats = seatsOfFormat(format);

  return (
    [...TABLE_FORMATS]
      .reverse()
      .find(
        (candidate) =>
          candidate < format && seatsOfFormat(candidate).every((seat) => seats.includes(seat)),
      ) ?? null
  );
}

/** The places that lose their chair going from one format to another. */
export function seatsRemovedBetween(from: number, to: number) {
  const kept = seatsOfFormat(to);
  return seatsOfFormat(from).filter((seat) => !kept.includes(seat));
}

/**
 * The format each table is dealt in tonight: the one the desk set at that table, or the
 * settings' own for a table nobody changed.
 */
export function readTableFormats(
  settingsFormat: number | null | undefined,
  overrides: unknown,
  tablesCount: number,
): number[] {
  const fallback = readTableFormat(settingsFormat);
  const own = Array.isArray(overrides) ? overrides : [];

  return Array.from({ length: Math.max(1, Math.trunc(tablesCount) || 1) }, (_, index) => {
    const value = Number(own[index]);
    return Number.isInteger(value) && value > 0 && value <= SEATS_PER_TABLE ? value : fallback;
  });
}

/** How many chairs stand at these tables altogether. */
export function countSeats(formats: readonly number[]) {
  return formats.reduce((total, format) => total + seatsOfFormat(format).length, 0);
}

/** Whether a chair stands at this place of this table tonight. */
export function isSeatAtTable(formats: readonly number[], table: number, seat: number) {
  const format = formats[table - 1];
  return format !== undefined && seatsOfFormat(format).includes(seat);
}

export type SeatOccupant = { id: string; name: string; registrationNumber: number | null };

/**
 * A chair at a table: the place it is booked by, what the dealer calls it, where it
 * stands round the table (the dealer at 0, a chair between two places half-way), and
 * who is in it.
 */
export type TableSeat = {
  label: string;
  place: number;
  player: SeatOccupant | null;
  seat: number;
};

export type SeatingTable = { format: number; isVip: boolean; number: number; seats: TableSeat[] };

/** Anybody who may be holding a chair, as much of them as the seating plan needs. */
export type SeatingPlayer = Pick<TournamentPlayer, "id" | "name" | "status"> & {
  registrationNumber?: number | null;
  seat?: number | null;
  table?: number | null;
};

/**
 * The VIP table is the last one the club opens — with a single table there is no VIP
 * seating to speak of.
 */
export function isVipTable(tableNumber: number, tablesCount: number) {
  return tablesCount > 1 && tableNumber === tablesCount;
}

/**
 * The room as the admin sees it at the door: every table, every chair, and who is in it.
 *
 * Each table is drawn in the format it is dealt in tonight — a chair the room does not
 * have seats somebody nowhere. `formats` is one format for every table, or one per table.
 *
 * Only players still in the tournament hold a seat — someone knocked out has left the
 * chair for the next walk-in.
 */
export function buildSeatingTables(
  players: SeatingPlayer[],
  tablesCount: number,
  formats?: number | readonly number[] | null,
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
    const format = formatOfTable(formats, number);

    return {
      format,
      isVip: isVipTable(number, tables),
      number,
      seats: seatsOfFormat(format).map((seat) => ({
        label: seatLabel(seat, format),
        place: standsBetweenPlaces(seat, format) ? seat + 0.5 : seat,
        player: seated.get(`${number}:${seat}`) ?? null,
        seat,
      })),
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

function distanceAround(from: number, to: number) {
  const apart = Math.abs(from - to);
  return Math.min(apart, PLACES_AROUND - apart);
}

/**
 * A seat drawn for a player who did not choose one.
 *
 * The draw is made among the emptiest tables this ticket may sit at, and only then among
 * their chairs: drawing from every free chair at once fills the first table to the brim
 * before the second one is touched, because the emptiest table always has the fewest
 * chairs to be drawn.
 *
 * At that table the chair is the one farthest from anybody already sitting there, so a
 * half-empty table fills evenly round the felt instead of six players huddled along one
 * side of it. Chairs equally far are left to the draw.
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
  const taken = table.seats.filter((seat) => seat.player !== null);

  const room = free.map((seat) =>
    taken.length === 0
      ? 0
      : Math.min(...taken.map((other) => distanceAround(seat.place, other.place))),
  );
  const most = Math.max(...room);
  const roomiest = free.filter((_, index) => room[index] === most);
  const seat = roomiest[Math.min(roomiest.length - 1, Math.floor(random() * roomiest.length))];

  return { seat: seat.seat, table: table.number };
}

/**
 * Where to bring a chair when every seat the ticket may take is gone: the table of its
 * kind with the fewest players among those that can still take one more format.
 */
export function pickTableToGrow(tables: SeatingTable[], ticket: "regular" | "vip") {
  const [chosen] = tables
    .filter((table) => table.isVip === (ticket === "vip"))
    .flatMap((table) => {
      const format = nextTableFormat(table.format);
      if (format === null) return [];

      return [{ format, players: table.seats.filter((seat) => seat.player !== null).length, table }];
    })
    .sort(
      (a, b) =>
        a.players - b.players || a.table.format - b.table.format || a.table.number - b.table.number,
    );

  return chosen ? { format: chosen.format, table: chosen.table.number } : null;
}

/** Where a chair sits on the oval, as percentages of the table's box. */
export function getSeatPosition(seat: Pick<TableSeat, "place">) {
  // The dealer sits at the bottom of the table, seat 1 on their left and the rest running
  // clockwise, each at its own place — so a short-handed table shows its gaps.
  const angle = (seat.place / PLACES_AROUND) * 2 * Math.PI + Math.PI / 2;

  // The chair is 38px across, so the ring is drawn a little inside the box and the top
  // and bottom seats stay whole.
  return {
    left: 50 + 46 * Math.cos(angle),
    top: 50 + 40 * Math.sin(angle),
  };
}
