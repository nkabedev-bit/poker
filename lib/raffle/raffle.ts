import { isVipRegistrationNumber } from "@/lib/player-registration-number";
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

export type Raffle = {
  /** A new id per spin, so a screen that reloads mid-spin does not replay the old one. */
  id: string;
  kind: RaffleKind;
  numbers: number[];
  prize: RafflePrize;
  spinSeconds: number;
  startedAt: string;
  winnerName: string;
  winnerNumber: number;
};

/** The wheel turns for this long before the pointer settles. */
export const RAFFLE_SPIN_SECONDS = 10;

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

/**
 * Draws one entrant. `random` is the caller's source — the server passes a
 * cryptographic one, so the result cannot be steered from a browser.
 */
export function pickRaffleWinner(entrants: RaffleEntrant[], random: () => number) {
  if (entrants.length === 0) return null;

  const index = Math.min(entrants.length - 1, Math.floor(random() * entrants.length));
  return entrants[index];
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
