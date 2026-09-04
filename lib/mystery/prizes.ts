/**
 * Mystery Bounty: every killer draws their own card from the prize deck, and the dealer
 * taps what it says. The deck holds four kinds of card, so the admin never types a
 * number — the values here are the deck itself.
 */
export const MYSTERY_BIG_BLIND_AMOUNTS = [1, 2, 3] as const;
export const MYSTERY_POINT_AMOUNTS = [20, 40, 60] as const;

export type MysteryPrize =
  | { amount: number; kind: "bigBlinds" }
  | { amount: number; kind: "points" }
  | { kind: "pass"; pass: "regular" | "vip" }
  | { kind: "other" };

/** One killer's card. The id ties it to the player who drew it. */
export type MysteryPrizeEntry = {
  killerId: string;
  prize: MysteryPrize;
};

/**
 * Reads a prize off the wire.
 *
 * Only the values printed on the cards are accepted: the client sends what the dealer
 * tapped, and an unknown card is no prize at all rather than a number nobody can audit.
 */
export function parseMysteryPrize(value: unknown): MysteryPrize | null {
  if (!value || typeof value !== "object") return null;

  const record = value as { amount?: unknown; kind?: unknown; pass?: unknown };

  if (record.kind === "bigBlinds") {
    const amount = Number(record.amount);
    return MYSTERY_BIG_BLIND_AMOUNTS.includes(amount as (typeof MYSTERY_BIG_BLIND_AMOUNTS)[number])
      ? { amount, kind: "bigBlinds" }
      : null;
  }

  if (record.kind === "points") {
    const amount = Number(record.amount);
    return MYSTERY_POINT_AMOUNTS.includes(amount as (typeof MYSTERY_POINT_AMOUNTS)[number])
      ? { amount, kind: "points" }
      : null;
  }

  if (record.kind === "pass") {
    return record.pass === "regular" || record.pass === "vip"
      ? { kind: "pass", pass: record.pass }
      : null;
  }

  return record.kind === "other" ? { kind: "other" } : null;
}

/** Reads the list of cards drawn for one knockout, keeping only the killers who played. */
export function parseMysteryPrizes(value: unknown, killerIds: string[]): MysteryPrizeEntry[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();

  return value.flatMap((item) => {
    const record = item as { killerId?: unknown; prize?: unknown } | null;
    const killerId = String(record?.killerId ?? "");
    const prize = parseMysteryPrize(record?.prize);

    if (!prize || !killerIds.includes(killerId) || seen.has(killerId)) return [];

    seen.add(killerId);
    return [{ killerId, prize }];
  });
}

/** Chips a card puts into the killer's stack — big blinds are counted at the level in play. */
export function getMysteryPrizeChips(prize: MysteryPrize, bigBlind: number): number {
  if (prize.kind !== "bigBlinds") return 0;

  const chips = Math.max(0, bigBlind) * prize.amount;
  return Number.isFinite(chips) ? chips : 0;
}

/** Rating points a card is worth; they ride the mystery-points pipeline into the standings. */
export function getMysteryPrizePoints(prize: MysteryPrize): number {
  return prize.kind === "points" ? prize.amount : 0;
}

/** The free entry a card pays out, if any. */
export function getMysteryPrizePass(prize: MysteryPrize): "regular" | "vip" | null {
  return prize.kind === "pass" ? prize.pass : null;
}

/** What the dealer sees on the confirmation screen, and what the knockout log keeps. */
export function describeMysteryPrize(prize: MysteryPrize): string {
  if (prize.kind === "bigBlinds") return `${prize.amount} ББ в стек`;
  if (prize.kind === "points") return `${prize.amount} PTS`;
  if (prize.kind === "pass") return prize.pass === "vip" ? "VIP проходка" : "Проходка";

  return "Другое";
}
