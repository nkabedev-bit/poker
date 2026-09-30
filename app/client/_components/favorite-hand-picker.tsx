"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Spade, X } from "lucide-react";
import { CLUB_FONT_CLASSES } from "../fonts";
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

/**
 * The card as picked so far, the way the deck prints it; a question mark for what is not.
 * Once both halves are in it turns face up — keyed by the card, so each new one turns.
 */
function CardFace({ draft }: { draft: Draft }) {
  const red = draft.suit ? isRedSuit(draft.suit) : false;
  const complete = Boolean(draft.rank && draft.suit);

  return (
    <span
      key={complete ? `${draft.rank}${draft.suit}` : "draft"}
      className={`flex h-[52px] w-[38px] flex-col items-center justify-center rounded-md bg-club-card font-display text-[17px] font-bold leading-none shadow-[0_2px_6px_rgba(0,0,0,0.5)] ${
        complete ? "client-card-flip" : ""
      }`}
      style={{ color: red ? "#c8213f" : "#15100f" }}
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
  "flex items-center justify-center rounded-xl border transition active:scale-95 disabled:opacity-25";

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
    <div aria-label={title} className="flex flex-col gap-2" role="group">
      <div className="flex items-end justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">{title}</span>
        <CardFace draft={draft} />
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {HAND_RANKS.map((rank) => (
          <button
            key={rank}
            aria-pressed={draft.rank === rank}
            className={`${choiceClass} h-11 font-display text-[14px] font-semibold ${
              draft.rank === rank
                ? "border-club-text bg-club-text text-[#15100f]"
                : "border-club-line bg-club-surface text-club-text"
            }`}
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
              className={`${choiceClass} h-12 text-[22px] ${
                chosen ? "border-[1.5px] border-club-rose bg-club-crimson/12" : "border-club-line bg-club-surface"
              } ${isRedSuit(suit) ? "text-club-rose" : "text-club-text"}`}
              disabled={isOther(draft.rank, suit)}
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
    // On a phone it comes up from the bottom edge, where the thumb already is; on a wider
    // screen it stands in the middle.
    <div
      aria-label="Любимая рука"
      aria-modal="true"
      className={`client-app ${CLUB_FONT_CLASSES} fixed inset-0 z-50 flex items-end justify-center bg-[rgba(5,3,4,0.72)] backdrop-blur-sm sm:items-center sm:px-4`}
      role="dialog"
    >
      <div className="client-sheet-up flex max-h-[92dvh] w-full max-w-[420px] flex-col gap-[18px] overflow-y-auto rounded-t-[28px] border-t border-club-line bg-[#151012] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 text-club-text sm:rounded-[28px] sm:border sm:pb-5">
        <span aria-hidden className="h-[5px] w-10 self-center rounded-full bg-white/[0.18]" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">Профиль</div>
            <div className="font-display text-[20px] font-semibold">Любимая рука</div>
          </div>
          <button
            aria-label="Закрыть"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-club-line bg-white/[0.06]"
            type="button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <CardPicker draft={first} other={secondCard} title="Первая карта" onChange={setFirst} />
        <CardPicker draft={second} other={firstCard} title="Вторая карта" onChange={setSecond} />

        <p className="text-[12px] leading-relaxed text-club-muted">
          Две карты, которые считаете своими. Показываются на аватарке — в профиле, рейтинге,
          у столов и в результатах игр.
        </p>

        {error ? <div className="text-center text-sm text-club-rose">{error}</div> : null}

        <div className="flex flex-col gap-2">
          <PrimaryButton
            disabled={!ready}
            loading={saving}
            onClick={() => firstCard && secondCard && void save(formatFavoriteHand([firstCard, secondCard]))}
          >
            Сохранить
          </PrimaryButton>
          <div className="flex gap-2">
            {stored ? (
              <GhostButton disabled={saving} onClick={() => void save(null)}>
                Убрать руку
              </GhostButton>
            ) : null}
            <GhostButton disabled={saving} onClick={onClose}>
              Отмена
            </GhostButton>
          </div>
        </div>
      </div>
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
      <GlassCard className="flex items-center gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-club-raised text-club-faint">
          <Lock size={18} />
        </span>
        <div className="flex flex-col gap-0.5">
          <div className="text-[15px] font-extrabold text-club-muted">Любимая рука</div>
          <div className="text-[12px] text-club-faint">
            Откроется со статуса MEMBER — ещё {countWord(left, ["игра", "игры", "игр"])}
          </div>
        </div>
      </GlassCard>
    );
  }

  const cards = parseFavoriteHand(hand);

  return (
    <button
      className="flex w-full items-center gap-4 rounded-[20px] border border-club-line bg-club-surface p-4 text-left transition-transform active:scale-[0.99]"
      type="button"
      onClick={onOpen}
    >
      {cards ? (
        <span className="flex shrink-0">
          {cards.map((card, index) => (
            <span
              key={`${card.rank}${card.suit}`}
              className="flex h-[46px] w-[34px] flex-col items-center justify-center rounded-md bg-club-card font-display leading-none shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
              style={{
                color: isRedSuit(card.suit) ? "#c8213f" : "#15100f",
                marginLeft: index === 0 ? 0 : -10,
                transform: `rotate(${index === 0 ? -6 : 6}deg)`,
              }}
            >
              <span className="text-[16px] font-bold">{formatRank(card.rank)}</span>
              <span className="text-[15px]">{SUIT_SYMBOLS[card.suit]}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-club-raised text-club-gold">
          <Spade size={20} />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-[15px] font-extrabold">Любимая рука</div>
        <div className="text-[12px] text-club-muted">
          {cards ? "На вашей аватарке по всему приложению" : "Выберите две карты для аватарки"}
        </div>
      </div>
      <span className="shrink-0 text-[13px] font-extrabold text-club-rose">{cards ? "Изменить" : "Выбрать"}</span>
    </button>
  );
}
