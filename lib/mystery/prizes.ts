/**
 * Mystery Bounty: every killer draws their own card from the prize deck, and the dealer
 * taps what it says. The deck holds four kinds of card, so the admin never types a
 * number — the values here are the deck itself.
 */
export const MYSTERY_BIG_BLIND_AMOUNTS = [1, 2, 3] as const;
export const MYSTERY_POINT_AMOUNTS = [20, 40, 60] as const;

/** A card with a prize printed on it — everything the deck holds except the Joker. */
export type MysteryBasePrize =
  | { amount: number; kind: "bigBlinds" }
  | { amount: number; kind: "points" }
  | { kind: "pass"; pass: "regular" | "vip" }
  | { kind: "other" };

/**
 * The Joker: one card that pays two.
 *
 * The two it pays are ordinary cards — a Joker never draws another Joker, so the deck
 * cannot chain, and a knockout is always settled with at most two prizes per killer.
 */
export type MysteryJokerPrize = { kind: "joker"; prizes: MysteryBasePrize[] };

export type MysteryPrize = MysteryBasePrize | MysteryJokerPrize;

/** How many cards a Joker turns into. */
export const MYSTERY_JOKER_PRIZES = 2;

/** The cards a Joker pays, or the card itself when it is an ordinary one. */
export function readPrizeParts(prize: MysteryPrize): MysteryBasePrize[] {
  return prize.kind === "joker" ? prize.prizes : [prize];
}

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

  const record = value as { amount?: unknown; kind?: unknown; pass?: unknown; prizes?: unknown };

  // A Joker is exactly two ordinary cards. Anything else — one card, three, or a Joker
  // nested inside one — is not a Joker this club deals, and is refused outright rather
  // than paid out as whatever survived parsing.
  if (record.kind === "joker") {
    if (!Array.isArray(record.prizes) || record.prizes.length !== MYSTERY_JOKER_PRIZES) {
      return null;
    }

    const prizes = record.prizes.map(parseMysteryBasePrize);
    return prizes.every((prize): prize is MysteryBasePrize => prize !== null)
      ? { kind: "joker", prizes }
      : null;
  }

  return parseMysteryBasePrize(value);
}

/** Reads one ordinary card off the wire; a Joker is not one of them. */
function parseMysteryBasePrize(value: unknown): MysteryBasePrize | null {
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
  const chips = readPrizeParts(prize).reduce(
    (total, part) => (part.kind === "bigBlinds" ? total + Math.max(0, bigBlind) * part.amount : total),
    0,
  );

  return Number.isFinite(chips) ? chips : 0;
}

/** Rating points a card is worth; they ride the mystery-points pipeline into the standings. */
export function getMysteryPrizePoints(prize: MysteryPrize): number {
  return readPrizeParts(prize).reduce(
    (total, part) => (part.kind === "points" ? total + part.amount : total),
    0,
  );
}

/**
 * The free entries a card pays out.
 *
 * A list rather than one pass: a Joker can turn up two of them, and both are the
 * player's — including one regular and one VIP, which are different entries entirely.
 */
export function getMysteryPrizePasses(prize: MysteryPrize): Array<"regular" | "vip"> {
  return readPrizeParts(prize).flatMap((part) => (part.kind === "pass" ? [part.pass] : []));
}

/** What the dealer sees on the confirmation screen, and what the knockout log keeps. */
export function describeMysteryPrize(prize: MysteryPrize): string {
  if (prize.kind === "joker") {
    return `Джокер: ${prize.prizes.map(describeMysteryPrize).join(" + ")}`;
  }
  if (prize.kind === "bigBlinds") return `${prize.amount} ББ в стек`;
  if (prize.kind === "points") return `${prize.amount} PTS`;
  if (prize.kind === "pass") return prize.pass === "vip" ? "VIP проходка" : "Проходка";

  return "Другое";
}
