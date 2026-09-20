import type { TournamentPlayer } from "@/lib/timer/types";

/** One player as the club's phones see them: a face, a name, a number and a fate. */
export type LiveTablePlayer = {
  avatarUrl: string | null;
  /** Where they came in the finishing order; null while they are still playing. */
  finishPlace: number | null;
  id: string;
  isMe: boolean;
  name: string;
  registrationNumber: number | null;
  seat: number | null;
  status: "active" | "eliminated";
};

export type LiveTable = {
  activeCount: number;
  /** Null for the players whose table nobody wrote down. */
  number: number | null;
  players: LiveTablePlayer[];
};

type RosterPlayer = Pick<TournamentPlayer, "id" | "name" | "status"> & {
  finishPlace?: number | null;
  registrationNumber?: number | null;
  seat?: number | null;
  table?: number | null;
  /** Null for a player who signed in on the web; their nickname is what finds them. */
  telegramId?: number | null;
};

function optionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Where a player sits in their table's list.
 *
 * Those still playing come first, in seat order, so the table reads the way it looks
 * from the door. The knocked-out follow in the order they went out, the last one first
 * — that is the news, and the player who busted an hour ago is the footnote.
 */
function compareTablePlayers(a: LiveTablePlayer, b: LiveTablePlayer) {
  if (a.status !== b.status) return a.status === "active" ? -1 : 1;

  if (a.status === "active") {
    return (a.seat ?? Number.MAX_SAFE_INTEGER) - (b.seat ?? Number.MAX_SAFE_INTEGER);
  }

  return (a.finishPlace ?? Number.MAX_SAFE_INTEGER) - (b.finishPlace ?? Number.MAX_SAFE_INTEGER);
}

/**
 * The room as a player in it sees it: every table, who is still in at it, and who went
 * out from it.
 *
 * A knocked-out player keeps the table they were sitting at — the roster never clears
 * it — so the evening can be read back table by table rather than as one long list of
 * names. Somebody moved between tables is shown at the last one they sat at, which is
 * the only one the roster remembers.
 *
 * Only players the club called by a number are here: a sign-up that never turned into
 * a ticket is not somebody anyone in the room could point at.
 */
export function buildLiveTables(
  players: RosterPlayer[],
  {
    findAvatar,
    isMe,
  }: {
    findAvatar?: (player: RosterPlayer) => string | null;
    isMe?: (player: RosterPlayer) => boolean;
  } = {},
): LiveTable[] {
  const tables = new Map<number | null, LiveTablePlayer[]>();

  for (const player of players) {
    const registrationNumber = optionalNumber(player.registrationNumber);
    if (registrationNumber === null) continue;

    const table = optionalNumber(player.table);
    const seated: LiveTablePlayer = {
      avatarUrl: findAvatar?.(player) ?? null,
      finishPlace: optionalNumber(player.finishPlace),
      id: player.id,
      isMe: isMe?.(player) ?? false,
      name: player.name,
      registrationNumber,
      seat: optionalNumber(player.seat),
      status: player.status === "active" ? "active" : "eliminated",
    };

    const existing = tables.get(table);
    if (existing) {
      existing.push(seated);
      continue;
    }

    tables.set(table, [seated]);
  }

  return [...tables.entries()]
    .map(([number, seated]) => ({
      activeCount: seated.filter((player) => player.status === "active").length,
      number,
      players: [...seated].sort(compareTablePlayers),
    }))
    // Tables in their own order, and the players nobody sat down last of all.
    .sort((a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER));
}
