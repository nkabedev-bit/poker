export const CARD_BATCH_MAX = 200;

/**
 * The prefix as it goes onto a card: trimmed, upper case, punctuation dropped.
 *
 * One spelling per pack, or the history splits: "mj" typed in a hurry would look like a
 * pack nobody has printed and start its numbering back at 1.
 */
export function normalizeCardPrefix(prefix: string) {
  return prefix.trim().toUpperCase().replace(/[^\w-]/g, "").slice(0, 12);
}

/**
 * How many digits a card number carries. Fixed rather than fitted to the batch: the
 * width used to grow with the run, so ten cards were numbered MJ-01 and a hundred were
 * numbered MJ-001 — two different codes for the same card, and only one of them typed
 * back correctly at the desk.
 */
export const CARD_NUMBER_WIDTH = 3;

/**
 * Builds the codes printed on a batch of venue cards: MJ-001, MJ-002, MJ-003…
 *
 * A run past 999 keeps going as MJ-1000 rather than losing a digit; everything below is
 * padded to the same three, which is what the desk types by hand.
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
  const cleanPrefix = normalizeCardPrefix(prefix);
  const safeCount = Math.min(CARD_BATCH_MAX, Math.max(1, Math.floor(count) || 1));
  const safeStart = Math.max(1, Math.floor(start) || 1);
  const width = Math.max(CARD_NUMBER_WIDTH, String(safeStart + safeCount - 1).length);

  return Array.from({ length: safeCount }, (_, index) => {
    const number = String(safeStart + index).padStart(width, "0");
    return cleanPrefix ? `${cleanPrefix}-${number}` : number;
  });
}

/** One run of printed cards, kept as what it was asked for rather than as its codes. */
export type CardBatch = {
  count: number;
  createdAt: string;
  id: string;
  prefix: string;
  startNumber: number;
};

/**
 * Where the next run of this pack starts: one past the highest number already printed.
 *
 * Packs are counted apart — the guest cards have their own numbering, and a hundred club
 * cards must not push G-001 out of reach. A pack nobody has printed starts at 1.
 */
export function nextStartNumber(batches: CardBatch[], prefix: string) {
  const pack = normalizeCardPrefix(prefix);
  const printed = batches
    .filter((batch) => normalizeCardPrefix(batch.prefix) === pack)
    .map((batch) => batch.startNumber + batch.count);

  return printed.length === 0 ? 1 : Math.max(...printed);
}
