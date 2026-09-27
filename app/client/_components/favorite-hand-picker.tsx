"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Lock, Spade, X } from "lucide-react";
import { GhostButton, GlassCard, PrimaryButton } from "./ui";
import {
  formatFavoriteHand,
  formatRank,
  HAND_RANKS,
  HAND_SUITS,
  isRedSuit,
  parseFavoriteHand,
  SUIT_SYMBOLS,
  type HandCard,
  type HandRank,
  type HandSuit,
} from "@/lib/players/favorite-hand";
import { countWord } from "@/lib/raffle/raffle-scenes";
import { TIER_GAMES, type PlayerTier } from "@/lib/players/tier";

const SUIT_NAMES: Record<HandSuit, string> = { c: "трефы", d: "бубны", h: "червы", s: "пики" };

/** A card while it is being picked: either half may still be missing. */
type Draft = { rank: HandRank | null; suit: HandSuit | null };

function toDraft(card: HandCard | undefined): Draft {
  return { rank: card?.rank ?? null, suit: card?.suit ?? null };
}

function readCard(draft: Draft): HandCard | null {
  return draft.rank && draft.suit ? { rank: draft.rank, suit: draft.suit } : null;
}

/** The card as picked so far, the way the deck prints it; a question mark for what is not. */
function CardFace({ draft }: { draft: Draft }) {
  const red = draft.suit ? isRedSuit(draft.suit) : false;

  return (
    <span
      className="flex h-9 min-w-[44px] items-center justify-center gap-0.5 rounded-lg bg-white px-2 text-[17px] font-extrabold leading-none"
      style={{ color: red ? "#d4152b" : "#121212" }}
    >
      {draft.rank || draft.suit ? (
        <>
          <span>{draft.rank ? formatRank(draft.rank) : "?"}</span>
          <span>{draft.suit ? SUIT_SYMBOLS[draft.suit] : "?"}</span>
        </>
      ) : (
        "?"
      )}
    </span>
  );
}

const choiceClass =
  "flex h-10 items-center justify-center rounded-xl border font-bold transition active:scale-95 disabled:opacity-25";

function choiceColours(chosen: boolean) {
  return chosen
    ? "border-white bg-white text-[#121212]"
    : "border-white/[0.08] bg-white/[0.04] text-white";
}

/**
 * One card being picked: thirteen ranks, four suits, and the card as it stands. The card
 * the other half of the hand already is cannot be picked again — that one choice is
 * greyed out rather than refused after the fact.
 */
function CardPicker({
  draft,
  onChange,
  other,
  title,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  other: HandCard | null;
  title: string;
}) {
  const isOther = (rank: HandRank | null, suit: HandSuit | null) =>
    Boolean(other && rank === other.rank && suit === other.suit);

  return (
    <div
      aria-label={title}
      className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-black/30 p-3"
      role="group"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-white/70">{title}</span>
        <CardFace draft={draft} />
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {HAND_RANKS.map((rank) => (
          <button
            key={rank}
            aria-pressed={draft.rank === rank}
            className={`${choiceClass} ${choiceColours(draft.rank === rank)} text-[15px]`}
            disabled={isOther(rank, draft.suit)}
            type="button"
            onClick={() => onChange({ ...draft, rank })}
          >
            {formatRank(rank)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {HAND_SUITS.map((suit) => {
          const chosen = draft.suit === suit;

          return (
            <button
              key={suit}
              aria-label={SUIT_NAMES[suit]}
              aria-pressed={chosen}
              className={`${choiceClass} ${choiceColours(chosen)} text-[22px]`}
              disabled={isOther(draft.rank, suit)}
              // Red suits stay red; black ones are drawn white on the dark button so they
              // can be seen at all, and black once the button turns white.
              style={isRedSuit(suit) ? { color: "#e0384f" } : undefined}
              type="button"
              onClick={() => onChange({ ...draft, suit })}
            >
              {SUIT_SYMBOLS[suit]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The favourite-hand picker: two cards the player calls their own, which then sit on
 * their avatar across the app.
 *
 * `onSave` stores the hand (null takes it off) and answers with a message to show, or
 * null once it went through.
 */
export function FavoriteHandPicker({
  current,
  onClose,
  onSave,
}: {
  current: string | null;
  onClose: () => void;
  onSave: (hand: string | null) => Promise<string | null>;
}) {
  const stored = parseFavoriteHand(current);
  const [first, setFirst] = useState<Draft>(() => toDraft(stored?.[0]));
  const [second, setSecond] = useState<Draft>(() => toDraft(stored?.[1]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const firstCard = readCard(first);
  const secondCard = readCard(second);
  const ready = Boolean(firstCard && secondCard);

  const save = async (hand: string | null) => {
    if (saving) return;

    setSaving(true);
    setError("");
    try {
      const refusal = await onSave(hand);
      if (refusal) setError(refusal);
    } finally {
      setSaving(false);
    }
  };

  // Drawn on the page's body: the screen it opens from is its own stacking layer, and
  // the menu at the bottom of the app would otherwise sit on top of the buttons.
  return createPortal(
    <div
      aria-label="Любимая рука"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
    >
      <GlassCard className="max-h-[92dvh] w-full max-w-[420px] space-y-3 overflow-y-auto border border-[#c8163f]/40">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
              Профиль
            </div>
            <div className="mt-1 text-[22px] font-bold tracking-tight">Любимая рука</div>
          </div>
          <button
            aria-label="Закрыть"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#c8163f]/60 bg-black/40"
            type="button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <CardPicker draft={first} other={secondCard} title="Первая карта" onChange={setFirst} />
        <CardPicker draft={second} other={firstCard} title="Вторая карта" onChange={setSecond} />

        <div className="text-[12px] leading-relaxed text-white/40">
          Две карты, которые считаете своими. Показываются на аватарке — в профиле, рейтинге,
          у столов и в результатах игр.
        </div>

        {error ? <div className="text-center text-sm text-rose-300">{error}</div> : null}

        <PrimaryButton
          disabled={!ready}
          loading={saving}
          onClick={() => firstCard && secondCard && void save(formatFavoriteHand([firstCard, secondCard]))}
        >
          Сохранить
        </PrimaryButton>
        {stored ? (
          <GhostButton disabled={saving} onClick={() => void save(null)}>
            Убрать руку
          </GhostButton>
        ) : null}
        <GhostButton disabled={saving} onClick={onClose}>
          Отмена
        </GhostButton>
      </GlassCard>
    </div>,
    document.body,
  );
}

/**
 * The profile's way into the picker. Below MEMBER the hand is locked, and the card says
 * how many games stand between the player and it.
 */
export function FavoriteHandCard({
  games,
  hand,
  onOpen,
  tier,
}: {
  games: number;
  hand: string | null;
  onOpen: () => void;
  tier: PlayerTier | null;
}) {
  if (!tier) {
    const left = Math.max(1, TIER_GAMES.member - Math.max(0, games));

    return (
      <GlassCard className="flex items-center gap-3 !p-[18px]">
        <Lock className="shrink-0 text-white/35" size={20} />
        <div>
          <div className="text-[15px] font-bold text-white/70">Любимая рука</div>
          <div className="mt-0.5 text-[12px] text-white/40">
            Откроется со статуса MEMBER — ещё {countWord(left, ["игра", "игры", "игр"])}
          </div>
        </div>
      </GlassCard>
    );
  }

  const cards = parseFavoriteHand(hand);

  return (
    <button
      className="block w-full text-left transition-transform active:scale-[0.99]"
      type="button"
      onClick={onOpen}
    >
      <GlassCard className="flex items-center justify-between gap-3 !p-[18px]">
        <div className="flex items-center gap-3">
          <Spade className="shrink-0 text-[#e9c07a]" size={22} />
          <div>
            <div className="text-[15px] font-bold">Любимая рука</div>
            <div className="mt-0.5 text-[12px] text-white/40">
              {cards ? "На вашей аватарке по всему приложению" : "Выберите две карты для аватарки"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {cards ? (
            <span className="flex gap-1 text-[16px] font-extrabold">
              {cards.map((card) => (
                <span
                  key={`${card.rank}${card.suit}`}
                  style={{ color: isRedSuit(card.suit) ? "#e0384f" : "#ffffff" }}
                >
                  {formatRank(card.rank)}
                  {SUIT_SYMBOLS[card.suit]}
                </span>
              ))}
            </span>
          ) : null}
          <ChevronRight className="text-white/35" size={19} />
        </div>
      </GlassCard>
    </button>
  );
}
