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
 * Sized by the face they sit on, so the same pair reads on a profile and in a list. Like
 * a real hand held in a fan, each card shows its rank and suit in the top corner — the
 * part the card in front leaves uncovered. A card is never narrower than a thumbnail's
 * corner can carry: below that the rank and the suit stop being letters.
 */
export function HandCards({ hand, size }: { hand: string; size: number }) {
  const cards = parseFavoriteHand(hand);
  if (!cards) return null;

  const width = Math.round(Math.max(15, size * 0.38));
  const height = Math.round(width * 1.38);
  const offset = Math.round(width * 0.6);

  return (
    <span
      aria-label={`Любимая рука: ${describeHand(cards)}`}
      className="pointer-events-none absolute"
      role="img"
      style={{
        bottom: -Math.round(height * 0.12),
        height,
        left: -Math.round(width * 0.2),
        width: width + offset,
      }}
    >
      {cards.map((card, index) => {
        const rank = formatRank(card.rank);

        return (
          <span
            key={`${card.rank}${card.suit}`}
            className="absolute top-0 flex flex-col items-start rounded-[3px] bg-white font-extrabold leading-[0.95] shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
            style={{
              color: isRedSuit(card.suit) ? "#d4152b" : "#121212",
              height,
              left: index === 0 ? 0 : offset,
              padding: `${Math.max(1, Math.round(width * 0.06))}px ${Math.max(1, Math.round(width * 0.08))}px`,
              transform: `rotate(${index === 0 ? -12 : 6}deg)`,
              width,
            }}
          >
            <span
              className="tracking-tighter"
              style={{ fontSize: Math.round(width * (rank.length > 1 ? 0.42 : 0.5)) }}
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
