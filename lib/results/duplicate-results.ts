import { buildNicknameKey } from "@/lib/players/nickname-key";

export type StoredResultRow = {
  countsForRating: boolean;
  createdAt: string;
  id: string;
  place: number | null;
  playerName: string;
  startedAt: string;
};

export type DuplicateGroup = {
  keep: StoredResultRow;
  remove: StoredResultRow[];
};

/**
 * The same evening stored twice because the club typed the nickname differently —
 * "Maks B" in a game sheet, "MaksB" in the monthly table. The table's own unique
 * constraint compares the text, so both rows were allowed in and the player read two
 * games where they had played one.
 *
 * Grouping is by the exact start of the game, not the date: two tournaments on one day
 * are two games, and only rows that share a start are the same evening.
 *
 * The row that survives is the one that knows most: a result with a finishing place
 * beats one without, a game that counts for the rating beats one that does not, and an
 * older row beats a newer one.
 */
export function findDuplicateResults(rows: StoredResultRow[]): DuplicateGroup[] {
  const byEvening = new Map<string, StoredResultRow[]>();

  for (const row of rows) {
    const key = `${row.startedAt}|${buildNicknameKey(row.playerName)}`;
    byEvening.set(key, [...(byEvening.get(key) ?? []), row]);
  }

  const groups: DuplicateGroup[] = [];

  for (const evening of byEvening.values()) {
    if (evening.length < 2) continue;

    const [keep, ...remove] = [...evening].sort(
      (a, b) =>
        Number(a.place === null) - Number(b.place === null) ||
        Number(!a.countsForRating) - Number(!b.countsForRating) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );

    groups.push({ keep, remove });
  }

  return groups.sort((a, b) => a.keep.startedAt.localeCompare(b.keep.startedAt));
}
