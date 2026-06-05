import type { TournamentPlayer } from "@/lib/timer/types";

export type EliminationRollbackLog = {
  eliminated_id: string;
  finish_place: number | null;
  killers: unknown;
  uses_reentry?: boolean | null;
  reentry_double?: boolean | null;
  mystery_bounty_points?: number | null;
  players_before?: unknown;
};

export function getTargetedEliminationRollbackPlayers(
  log: EliminationRollbackLog,
  players: TournamentPlayer[],
  options: { shiftLaterFinishPlaces?: boolean } = {},
) {
  const bountyEntries: Array<[string, number]> = [];
  const bountyChipEntries: Array<[string, number]> = [];
  const mysteryPointsEntries: Array<[string, number]> = [];
  for (const killer of Array.isArray(log.killers) ? log.killers : []) {
    const item = killer as { bountyChips?: unknown; id?: unknown; share?: unknown };
    const id = String(item.id ?? "");
    const share = Number(item.share ?? 0);
    const bountyChips = Number(item.bountyChips ?? 0);
    if (id && share > 0) bountyEntries.push([id, share]);
    if (id && bountyChips > 0) bountyChipEntries.push([id, bountyChips]);
  }

  // Estimate mystery points from log's mystery_bounty_points field
  const logRecord = log as EliminationRollbackLog & { mystery_bounty_points?: number };
  const totalMysteryPoints = Number(logRecord.mystery_bounty_points ?? 0);
  if (totalMysteryPoints > 0) {
    for (const [id, share] of bountyEntries) {
      mysteryPointsEntries.push([id, share * totalMysteryPoints]);
    }
  }

  const bountyByPlayerId = new Map<string, number>(bountyEntries);
  const bountyChipsByPlayerId = new Map<string, number>(bountyChipEntries);
  const mysteryPointsByPlayerId = new Map<string, number>(mysteryPointsEntries);
  const usedReentry = Boolean(log.uses_reentry) || log.finish_place === null;
  const usedDoubleReentry = usedReentry && Boolean(log.reentry_double);
  const restoredFinishPlace = Number(log.finish_place);

  return players.map((player) => {
    let restored =
      player.id === log.eliminated_id
        ? (usedReentry
          ? {
            ...player,
            rebuys: Math.max(0, Number(player.rebuys ?? 0) - 1),
            doubleRebuys: usedDoubleReentry
              ? Math.max(0, Number(player.doubleRebuys ?? 0) - 1)
              : Number(player.doubleRebuys ?? 0),
          }
          : {
            ...player,
            finishPlace: null,
            status: "active" as const,
          })
        : player;

    if (
      options.shiftLaterFinishPlaces &&
      Number.isInteger(restoredFinishPlace) &&
      restored.status === "eliminated" &&
      restored.finishPlace !== null &&
      restored.finishPlace > 0 &&
      restored.finishPlace < restoredFinishPlace
    ) {
      restored = {
        ...restored,
        finishPlace: restored.finishPlace + 1,
      };
    }

    if (log.finish_place === 2 && restored.finishPlace === 1) {
      restored = { ...restored, finishPlace: null };
    }

    const bountyShare = bountyByPlayerId.get(player.id);
    const bountyChips = bountyChipsByPlayerId.get(player.id) ?? 0;
    const mysteryPts = mysteryPointsByPlayerId.get(player.id) ?? 0;
    if (!bountyShare && !bountyChips && !mysteryPts) return restored;

    return {
      ...restored,
      bountyChipsTotal: Math.max(0, Number(((restored.bountyChipsTotal || 0) - bountyChips).toFixed(6))),
      bountyCount: Math.max(0, Number(((restored.bountyCount || 0) - (bountyShare ?? 0)).toFixed(6))),
      mysteryBountyPoints: Math.max(0, Number(((restored.mysteryBountyPoints || 0) - mysteryPts).toFixed(2))),
      stack: Math.max(0, Number(((restored.stack || 0) - bountyChips).toFixed(6))),
    };
  });
}
