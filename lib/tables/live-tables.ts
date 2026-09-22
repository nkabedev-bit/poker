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
  /** Null once they are out: the chair is somebody else's to take. */
  seat: number | null;
  status: "active" | "eliminated";
};

export type LiveTable = {
  /** Null for the players whose table nobody wrote down. */
  number: number | null;
  /** Those still in at it, in seat order. */
  players: LiveTablePlayer[];
};

/** The room as a player in it sees it: who is still in at each table, and who is out. */
export type LiveRoom = {
  /** Everyone knocked out, the last one first. They no longer sit anywhere. */
  eliminated: LiveTablePlayer[];
  tables: LiveTable[];
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

/** A table reads the way it looks from the door: seat by seat. */
function compareSeats(a: LiveTablePlayer, b: LiveTablePlayer) {
  return (a.seat ?? Number.MAX_SAFE_INTEGER) - (b.seat ?? Number.MAX_SAFE_INTEGER);
}

/**
 * The knocked-out in the order they went out, the last one first: that is the news, and
 * the player who busted an hour ago is the footnote. The finishing place says it — the
 * later a player went out, the better the place.
 */
function compareKnockouts(a: LiveTablePlayer, b: LiveTablePlayer) {
  return (a.finishPlace ?? Number.MAX_SAFE_INTEGER) - (b.finishPlace ?? Number.MAX_SAFE_INTEGER);
}

/**
 * The room as a player in it sees it: every table with who is still in at it, and
 * everybody already out listed after them all.
 *
 * The question a player looks up from their own table to ask is who is still playing
 * and where. A knocked-out player is no longer at any table — the roster remembers the
 * chair they left, but somebody else may already be sitting in it — so they go to the
 * end of the list rather than disappearing: the room would otherwise get shorter with
 * nothing to show for it.
 *
 * Only players the club called by a number are here: a sign-up that never turned into
 * a ticket is not somebody anyone in the room could point at.
 */
export function buildLiveRoom(
  players: RosterPlayer[],
  {
    findAvatar,
    isMe,
  }: {
    findAvatar?: (player: RosterPlayer) => string | null;
    isMe?: (player: RosterPlayer) => boolean;
  } = {},
): LiveRoom {
  const tables = new Map<number | null, LiveTablePlayer[]>();
  const eliminated: LiveTablePlayer[] = [];

  for (const player of players) {
    const registrationNumber = optionalNumber(player.registrationNumber);
    if (registrationNumber === null) continue;

    const playing = player.status === "active";
    const listed: LiveTablePlayer = {
      avatarUrl: findAvatar?.(player) ?? null,
      finishPlace: optionalNumber(player.finishPlace),
      id: player.id,
      isMe: isMe?.(player) ?? false,
      name: player.name,
      registrationNumber,
      seat: playing ? optionalNumber(player.seat) : null,
      status: playing ? "active" : "eliminated",
    };

    if (!playing) {
      eliminated.push(listed);
      continue;
    }

    const table = optionalNumber(player.table);
    const seated = tables.get(table);
    if (seated) {
      seated.push(listed);
      continue;
    }

    tables.set(table, [listed]);
  }

  return {
    eliminated: eliminated.sort(compareKnockouts),
    tables: [...tables.entries()]
      .map(([number, seated]) => ({ number, players: seated.sort(compareSeats) }))
      // Tables in their own order, and the players nobody sat down last of all.
      .sort(
        (a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER),
      ),
  };
}
