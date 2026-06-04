import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

export const PTS_PLACE_COUNT = 28;

export type PtsPlaceTemplate = {
  id: string;
  name: string;
  placePoints: number[];
};

export type PtsBountyTemplate = {
  bountyPoints: number;
  id: string;
  name: string;
};

export type PtsSettings = Pick<TournamentExtras["pts"], "bountyPoints" | "placePoints">;

export type KillerShare = {
  id: string;
  name: string;
  share: number;
};

export type PtsStandingRow = {
  bountyCount: number | null;
  place: number;
  playerName: string;
  points: number | null;
};

function roundBountyCount(value: number) {
  return Number(value.toFixed(6));
}

export function createDefaultPlacePoints() {
  return Array.from({ length: PTS_PLACE_COUNT }, () => 0);
}

export function normalizePlacePoints(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: PTS_PLACE_COUNT }, (_, index) => {
    const points = Number(source[index] ?? 0);
    return Number.isFinite(points) ? points : 0;
  });
}

export function normalizePtsPlaceTemplates(value: unknown): PtsPlaceTemplate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((template) => {
      if (!template || typeof template !== "object") return null;
      const item = template as Partial<PtsPlaceTemplate>;
      const name = String(item.name ?? "").trim();
      if (!name) return null;

      return {
        id: String(item.id || crypto.randomUUID()),
        name,
        placePoints: normalizePlacePoints(item.placePoints),
      };
    })
    .filter((template): template is PtsPlaceTemplate => Boolean(template));
}

export function normalizePtsBountyTemplates(value: unknown): PtsBountyTemplate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((template) => {
      if (!template || typeof template !== "object") return null;
      const item = template as Partial<PtsBountyTemplate>;
      const name = String(item.name ?? "").trim();
      if (!name) return null;

      return {
        bountyPoints: Number.isFinite(Number(item.bountyPoints)) ? Number(item.bountyPoints) : 0,
        id: String(item.id || crypto.randomUUID()),
        name,
      };
    })
    .filter((template): template is PtsBountyTemplate => Boolean(template));
}

export function recordPtsElimination(input: {
  eliminatedId: string;
  isBounty: boolean;
  killers: KillerShare[];
  players: TournamentPlayer[];
  usesReentry: boolean;
}) {
  const activePlayers = input.players.filter((player) => player.status === "active");
  const finishPlace = input.usesReentry ? null : activePlayers.length;
  const tournamentFinished = !input.usesReentry && activePlayers.length === 2;
  const bountyByPlayerId = new Map<string, number>();

  if (input.isBounty) {
    for (const killer of input.killers) {
      if (!killer.id || killer.share <= 0) continue;
      bountyByPlayerId.set(killer.id, (bountyByPlayerId.get(killer.id) ?? 0) + killer.share);
    }
  }

  const survivorId =
    tournamentFinished
      ? activePlayers.find((player) => player.id !== input.eliminatedId)?.id ?? null
      : null;

  const players = input.players.map((player) => {
    let next = player;

    if (player.id === input.eliminatedId) {
      next = input.usesReentry
        ? {
          ...next,
          rebuys: (next.rebuys || 0) + 1,
        }
        : {
          ...next,
          finishPlace,
          status: "eliminated",
        };
    }

    if (player.id === survivorId) {
      next = {
        ...next,
        finishPlace: 1,
      };
    }

    const bountyShare = bountyByPlayerId.get(player.id);
    if (bountyShare) {
      next = {
        ...next,
        bountyCount: roundBountyCount((next.bountyCount || 0) + bountyShare),
      };
    }

    return next;
  });

  return {
    finishPlace,
    players,
    tournamentFinished,
  };
}

export function buildPtsStandingsRows(
  players: TournamentPlayer[],
  pts: Partial<PtsSettings>,
): PtsStandingRow[] {
  const placePoints = normalizePlacePoints(pts.placePoints);
  const bountyPoints = Number.isFinite(Number(pts.bountyPoints)) ? Number(pts.bountyPoints) : 0;
  const placesCount = Math.min(PTS_PLACE_COUNT, Math.max(players.length, 1));
  const placedPlayers = players
    .filter((player) => player.finishPlace && player.finishPlace > 0 && player.finishPlace <= PTS_PLACE_COUNT)
    .sort((a, b) => (a.finishPlace ?? PTS_PLACE_COUNT) - (b.finishPlace ?? PTS_PLACE_COUNT));

  const firstPlace = placedPlayers[0]?.finishPlace ?? placesCount + 1;
  const leadingEmptyCount = Math.min(Math.max(firstPlace - 1, 0), placesCount);
  const leadingEmptyRows = Array.from({ length: leadingEmptyCount }, (_, index) => ({
    bountyCount: null,
    place: index + 1,
    playerName: "",
    points: null,
  }));

  const placedRows = placedPlayers.slice(0, placesCount - leadingEmptyCount).map((player, index) => {
    const place = leadingEmptyCount + index + 1;

    const placePts = placePoints[place - 1] ?? 0;
    const bountyPts = Number(((player.bountyCount || 0) * bountyPoints).toFixed(2));
    return {
      bountyCount: Number((player.bountyCount || 0).toFixed(2)),
      place,
      playerName: player.name || "Без имени",
      points: Number((placePts + bountyPts).toFixed(2)),
    };
  });

  return [...leadingEmptyRows, ...placedRows];
}
