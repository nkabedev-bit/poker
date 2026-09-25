import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { CLASSIC_TRAVEL_CELLS } from "@/lib/raffle/reel-motion";
import type { RaffleMotion } from "@/lib/raffle/raffle-scenes";
import type { TournamentPlayer } from "@/lib/timer/types";

export type RaffleKind = "regular" | "vip";

/** How the winner's prize ended up, so the admin knows whether to hand anything over. */
export type RafflePrize = "granted" | "manual" | "none";

export type RaffleEntrant = {
  /** The club account behind the seat, which is what a prize is credited to. */
  accountId: string | null;
  name: string;
  number: number;
  telegramId: number | null;
};

/**
 * One player as the reel shows them: the club's photo of them, or their nickname when
 * there is none — somebody seated by hand has no account to keep a face on, and a
 * closed Telegram profile hands out no picture.
 */
export type RaffleFace = {
  avatarUrl: string | null;
  name: string;
  number: number;
};

export type Raffle = {
  /**
   * Everyone in the draw, in the order the reel runs them, frozen when the draw is
   * taken: a player seated mid-spin must not change the reel under the room's eyes.
   * Missing on draws held before the reel existed, which fall back to their numbers.
   */
  faces?: RaffleFace[];
  /** A new id per spin, so a screen that reloads mid-spin does not replay the old one. */
  id: string;
  kind: RaffleKind;
  /**
   * How the draw runs — one of the reel's five ways or one of the three scenes — picked
   * with the result so every screen plays the same run. Missing on draws taken before
   * there was a choice, which run the classic reel.
   */
  motion?: RaffleMotion;
  numbers: number[];
  prize: RafflePrize;
  spinSeconds: number;
  startedAt: string;
  winnerName: string;
  winnerNumber: number;
};

/**
 * How long after the draw the winner hears about it from the bot.
 *
 * The message must not beat the reel. A screen whose live connection is down picks the
 * draw up only on its 45-second poll, then waits up to a second and a half for the faces
 * and turns for up to `MAX_REEL_SPIN_SECONDS` more: a minute lets the room see the winner
 * before their phone does.
 */
export const RAFFLE_WIN_NOTICE_DELAY_MS = 60_000;

/** What is left beyond the needle when it stops, so the screen is not half bare. */
const REEL_TAIL_CELLS = 10;

/**
 * How the reel is built: which face it starts on, how many cells long it is, and which
 * one the needle stops over.
 *
 * The run is as long as the draw's motion asks, whoever wins and however big the club
 * is. Rather than lengthening the reel until it reaches the winner's copy, it is started
 * at whichever face puts the winner under the needle — the list order means nothing to
 * the room, and a reel that grows with the guest list is one the laptop has to draw.
 *
 * A reel run the other way across the screen is the same reel mirrored, so it is built
 * the same way.
 */
export function buildRaffleReel(
  faces: number,
  winnerIndex: number,
  travelCells: number = CLASSIC_TRAVEL_CELLS,
) {
  const total = Math.max(1, faces);

  return {
    landingIndex: travelCells,
    length: travelCells + REEL_TAIL_CELLS,
    passes: Math.ceil((travelCells + REEL_TAIL_CELLS) / total),
    startOffset: (((winnerIndex - travelCells) % total) + total) % total,
  };
}

/**
 * What the winner reads in the club's bot.
 *
 * The pass is credited to the profile before this is sent, so the regular message can
 * say so outright — a player who is told to look in the app must find it there. The VIP
 * certificate is a piece of paper handed over at the table, and says nothing about the
 * app at all.
 */
export const RAFFLE_WIN_MESSAGE: Record<RaffleKind, string> = {
  regular: "Вы победили в розыгрыше! Ваш приз — проходка, она уже начислена в приложении.",
  vip: "Вы победили в розыгрыше для VIP игроков! Ваш приз — сертификат от наших партнёров.",
};

/**
 * Everyone in tonight's draw.
 *
 * The whole room takes part, knocked-out players included: they paid their entry and
 * are still in the hall.
 *
 * The free pass is drawn on the whole room — a VIP ticket is a better ticket, not a
 * smaller draw, so VIP guests stand in it alongside everyone else. The VIP draw is the
 * one that narrows: it is for VIP tickets only, which the club reads off the
 * registration number — 21 to 30 is the VIP range. A VIP guest therefore stands in both
 * and can win both, which is the point of the ticket.
 */
export function listRaffleEntrants(
  players: Array<
    Pick<TournamentPlayer, "accountId" | "name" | "registrationNumber" | "telegramId">
  >,
  kind: RaffleKind,
): RaffleEntrant[] {
  return players
    .filter((player) => {
      const number = Number(player.registrationNumber);
      if (!Number.isInteger(number) || number <= 0) return false;

      return kind === "vip" ? isVipRegistrationNumber(number) : true;
    })
    .map((player) => ({
      accountId: player.accountId ?? null,
      name: player.name,
      number: Number(player.registrationNumber),
      telegramId: player.telegramId ?? null,
    }))
    .sort((a, b) => a.number - b.number);
}

/** A past win, as the club remembers it between evenings. */
export type RaffleWinRecord = {
  accountId: string | null;
  /** The Moscow date of the evening the draw was held on, "2026-09-15". */
  playedOn: string;
  playerName: string;
};

/**
 * How many evenings with a draw a winner's chance takes to come back in full.
 *
 * The club wants the prizes to go round the room. A winner is not shut out — a player
 * who won yesterday can still win tonight — but they stand in the draw at a fifth of
 * everyone else's weight on the evening of the win, and gain a fifth back with every
 * evening the club holds a draw: 0.2, 0.4, 0.6, 0.8, and from the fifth evening on the
 * same as a player who never won.
 */
export const RAFFLE_RECOVERY_EVENINGS = 5;

/** The Moscow date an evening belongs to, which is how draws are grouped into evenings. */
export function toRaffleEvening(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(date);
}

/**
 * Each entrant's weight in tonight's draw, in the entrants' order.
 *
 * Wins of both kinds count: a player who took the free pass tonight stands in the VIP
 * draw at a fifth of the weight, which is the point — one guest collecting both prizes
 * is exactly what the club wants to be rare. Evenings are counted as the club holds
 * them, not as the player attends: a regular who skips a week comes back recovered.
 *
 * A win is matched to the entrant by account, and by nickname for the wins that have no
 * account behind them — the ones carried over from the ledger, or a guest added by hand.
 */
export function getRaffleWeights(
  entrants: Array<Pick<RaffleEntrant, "accountId" | "name">>,
  wins: RaffleWinRecord[],
  tonight: string,
) {
  const evenings = [...new Set([...wins.map((win) => win.playedOn), tonight])].sort();

  return entrants.map((entrant) => {
    const nicknameKey = buildNicknameKey(entrant.name);
    const lastWin = wins
      .filter(
        (win) =>
          (entrant.accountId && win.accountId === entrant.accountId) ||
          (nicknameKey !== "" && buildNicknameKey(win.playerName) === nicknameKey),
      )
      .map((win) => win.playedOn)
      .sort()
      .at(-1);

    if (!lastWin) return 1;

    const eveningsSince = evenings.filter((evening) => evening > lastWin && evening <= tonight).length;
    return Math.min(1, (eveningsSince + 1) / RAFFLE_RECOVERY_EVENINGS);
  });
}

/**
 * Draws one entrant. `random` is the caller's source — the server passes a
 * cryptographic one, so the result cannot be steered from a browser.
 *
 * Without weights every entrant is equally likely; with them, an entrant's chance is
 * their weight over the room's total.
 */
export function pickRaffleWinner(
  entrants: RaffleEntrant[],
  random: () => number,
  weights?: number[],
) {
  if (entrants.length === 0) return null;

  const usable = entrants.map((_, index) => {
    const weight = weights?.[index] ?? 1;
    return Number.isFinite(weight) && weight > 0 ? weight : 0;
  });
  const total = usable.reduce((sum, weight) => sum + weight, 0);

  if (total <= 0) {
    const index = Math.min(entrants.length - 1, Math.floor(random() * entrants.length));
    return entrants[index];
  }

  let point = random() * total;
  for (let index = 0; index < entrants.length; index += 1) {
    point -= usable[index];
    if (point < 0 && usable[index] > 0) return entrants[index];
  }

  // Rounding can leave the point a hair past the end; the last weighted entrant takes it.
  for (let index = entrants.length - 1; index >= 0; index -= 1) {
    if (usable[index] > 0) return entrants[index];
  }
  return entrants[entrants.length - 1];
}

export function isRaffle(value: unknown): value is Raffle {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "string" &&
    Array.isArray(item.numbers) &&
    typeof item.winnerNumber === "number"
  );
}
