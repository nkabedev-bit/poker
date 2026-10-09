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
 * The people behind the draw, who stay out of it: the club's developer, who builds it and
 * sets it up, and the venue's owner, who hosts the evening. A prize won by either would
 * look rigged to the room, however fair the draw is.
 */
const EXCLUDED_NICKNAME_KEYS = new Set(["kabedev", "Киберпсих"].map(buildNicknameKey));

/**
 * Everyone in tonight's draw.
 *
 * The whole room takes part, knocked-out players included: they paid their entry and
 * are still in the hall. The club's developer and the venue's owner alone are left out,
 * of both draws.
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
      if (EXCLUDED_NICKNAME_KEYS.has(buildNicknameKey(player.name))) return false;

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
  telegramId?: number | null;
};

/** One evening a player played, as the results remember it. */
export type RaffleGameRecord = {
  playedOn: string;
  playerName: string;
  telegramId: number | null;
};

/**
 * How many of their own games a winner plays at the lowered chance.
 *
 * The club wants the prizes to go round the room. A winner is not shut out — they can
 * win again tonight or next week — but for the ten games after a win they stand in the
 * draw at a fifth of everyone else's weight. On the eleventh their chance is back in
 * full at once, not a little at a time. The games are the player's own: a regular who
 * skips a month comes back still owing the same ten evenings.
 */
export const RAFFLE_COOLDOWN_GAMES = 10;

/** A recent winner's weight in the draw, against everyone else's 1. */
export const RAFFLE_COOLDOWN_WEIGHT = 0.2;

/** The Moscow date an evening belongs to, which is how draws are grouped into evenings. */
export function toRaffleEvening(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(date);
}

type RaffleIdentity = Pick<RaffleEntrant, "accountId" | "name"> & { telegramId?: number | null };

/** Whether a win or a game belongs to this entrant: by account, Telegram or nickname. */
function isSamePlayer(
  entrant: RaffleIdentity,
  record: { accountId?: string | null; playerName: string; telegramId?: number | null },
) {
  if (entrant.accountId && record.accountId === entrant.accountId) return true;
  if (entrant.telegramId && record.telegramId === entrant.telegramId) return true;

  const nicknameKey = buildNicknameKey(entrant.name);
  return nicknameKey !== "" && buildNicknameKey(record.playerName) === nicknameKey;
}

/**
 * The evening of an entrant's latest win, or null for someone who never won.
 *
 * A win is matched by account, by Telegram, and by nickname for the wins that have
 * neither behind them — the ones carried over from the ledger, or a guest added by hand.
 */
export function findLastRaffleWin(entrant: RaffleIdentity, wins: RaffleWinRecord[]) {
  return (
    wins
      .filter((win) => isSamePlayer(entrant, win))
      .map((win) => win.playedOn)
      .sort()
      .at(-1) ?? null
  );
}

/**
 * Each entrant's weight in tonight's draw, in the entrants' order.
 *
 * Wins of both kinds count: a player who took the free pass tonight stands in the VIP
 * draw at the lowered weight, which is the point — one guest collecting both prizes is
 * exactly what the club wants to be rare. Tonight is one of the ten games; the evenings
 * before it come from the results, which are written only when a game finishes.
 */
export function getRaffleWeights(
  entrants: RaffleIdentity[],
  wins: RaffleWinRecord[],
  games: RaffleGameRecord[],
  tonight: string,
) {
  return entrants.map((entrant) => {
    const lastWin = findLastRaffleWin(entrant, wins);
    if (!lastWin) return 1;
    if (lastWin >= tonight) return RAFFLE_COOLDOWN_WEIGHT;

    const playedSince = new Set(
      games
        .filter((game) => game.playedOn > lastWin && game.playedOn < tonight && isSamePlayer(entrant, game))
        .map((game) => game.playedOn),
    );

    // Tonight counts as one of the games after the win.
    return playedSince.size + 1 <= RAFFLE_COOLDOWN_GAMES ? RAFFLE_COOLDOWN_WEIGHT : 1;
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
