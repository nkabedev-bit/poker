import { z } from "zod";

// An empty cell means "no value", not zero: a player who finished outside the scoring
// places has no place at all, and coercing that to 0 would fail validation.
const emptyToNull = (value: unknown) =>
  value === "" || value === null || value === undefined ? null : value;

export const editedResultRowSchema = z.object({
  knockouts: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce.number().min(0).max(999),
  ),
  place: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(999).nullable()),
  playerName: z.string().trim().max(80),
  points: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 0 : value),
    z.coerce.number().min(-9999).max(99999),
  ),
  telegramId: z.preprocess(emptyToNull, z.coerce.number().int().nullable()),
});

export type EditedResultRow = z.infer<typeof editedResultRowSchema>;

export class ResultEditError extends Error {}

/**
 * Cleans up a hand-edited finishing table before it replaces the stored one.
 *
 * An admin fixing a misclick after the game types into a grid, so the usual mistakes
 * are blank rows left behind and the same player entered twice — the first is dropped,
 * the second refused, because two rows for one player would double their month.
 */
export function normalizeEditedRows(rows: unknown): EditedResultRow[] {
  const parsed = z.array(editedResultRowSchema).parse(rows);
  const kept = parsed.filter((row) => row.playerName.length > 0);

  const seen = new Set<string>();
  for (const row of kept) {
    const key = row.playerName.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) {
      throw new ResultEditError(`Игрок «${row.playerName}» указан дважды`);
    }
    seen.add(key);
  }

  const places = kept.map((row) => row.place).filter((place): place is number => place !== null);
  if (new Set(places).size !== places.length) {
    throw new ResultEditError("Одно место занято двумя игроками");
  }

  return [...kept].sort((a, b) => (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER));
}
