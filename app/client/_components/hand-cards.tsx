import {
  formatRank,
  isRedSuit,
  parseFavoriteHand,
  SUIT_SYMBOLS,
  type HandCard,
} from "@/lib/players/favorite-hand";

/** "Q♠ 10♠" — the hand as a screen reader says it. */
function describeHand(cards: readonly HandCard[]) {
  return cards.map((card) => `${formatRank(card.rank)}${SUIT_SYMBOLS[card.suit]}`).join(" ");
}

/**
 * The player's favourite hand, two small cards fanned over the corner of their avatar.
 *
 * Sized by the face they sit on, so the same pair reads on a profile and in a list. The
 * fan hangs off the face's lower-right corner by a share of the face, so it keeps to the
 * corner and leaves the face in view. Each card is a cream face with its rank over its
 * suit, the way the club's own deck prints them. A card is never narrower than a
 * thumbnail's corner can carry: below that the rank and the suit stop being letters.
 */
export function HandCards({ hand, size }: { hand: string; size: number }) {
  const cards = parseFavoriteHand(hand);
  if (!cards) return null;

  const width = Math.round(Math.max(13, size * 0.3));
  const height = Math.round(width * 1.36);
  const offset = Math.round(width * 0.55);
  const overhang = Math.round(size * 0.15);

  return (
    <span
      aria-label={`Любимая рука: ${describeHand(cards)}`}
      className="pointer-events-none absolute"
      role="img"
      style={{
        bottom: -Math.round(overhang * 0.6),
        height,
        right: -overhang,
        width: width + offset,
      }}
    >
      {cards.map((card, index) => {
        const rank = formatRank(card.rank);

        return (
          <span
            key={`${card.rank}${card.suit}`}
            className="absolute top-0 flex flex-col items-center justify-center rounded-[3px] bg-club-card font-display leading-none shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            style={{
              color: isRedSuit(card.suit) ? "#c8213f" : "#15100f",
              height,
              left: index === 0 ? 0 : offset,
              transform: `rotate(${index === 0 ? -8 : 8}deg)`,
              width,
            }}
          >
            <span
              className="font-bold tracking-tighter"
              style={{ fontSize: Math.round(width * (rank.length > 1 ? 0.42 : 0.52)) }}
            >
              {rank}
            </span>
            <span style={{ fontSize: Math.round(width * 0.46) }}>{SUIT_SYMBOLS[card.suit]}</span>
          </span>
        );
      })}
    </span>
  );
}
