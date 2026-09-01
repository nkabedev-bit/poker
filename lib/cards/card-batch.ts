export const CARD_BATCH_MAX = 200;

/**
 * Builds the codes printed on a batch of venue cards: MJ-01, MJ-02, MJ-03…
 *
 * Numbers are padded to a common width so the whole batch lines up on the card and in
 * any list — and the width grows with the batch, so a run past 99 reads MJ-100 rather
 * than falling out of step.
 */
export function buildCardCodes({
  count,
  prefix,
  start = 1,
}: {
  count: number;
  prefix: string;
  start?: number;
}) {
  const cleanPrefix = prefix.trim().replace(/[^\w-]/g, "").slice(0, 12);
  const safeCount = Math.min(CARD_BATCH_MAX, Math.max(1, Math.floor(count) || 1));
  const safeStart = Math.max(1, Math.floor(start) || 1);
  const width = Math.max(2, String(safeStart + safeCount - 1).length);

  return Array.from({ length: safeCount }, (_, index) => {
    const number = String(safeStart + index).padStart(width, "0");
    return cleanPrefix ? `${cleanPrefix}-${number}` : number;
  });
}
