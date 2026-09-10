import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

export type FinancePrices = {
  addonPrice: number;
  buyIn: number;
  doubleRebuyPrice: number;
  /** What a "1+1" costs for the pair; each half of it is one player's ticket. */
  duoBuyIn: number;
  rebuyPrice: number;
  vipBuyIn: number;
};

function toPrice(value: unknown) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/** The club's prices for tonight, as the admin set them for this tournament. */
export function getFinancePrices(
  settings: Partial<TournamentExtras["settings"]>,
): FinancePrices {
  return {
    addonPrice: toPrice(settings.addonPrice),
    buyIn: toPrice(settings.buyIn),
    doubleRebuyPrice: toPrice(settings.doubleRebuyPrice),
    duoBuyIn: toPrice(settings.duoBuyIn),
    rebuyPrice: toPrice(settings.rebuyPrice),
    vipBuyIn: toPrice(settings.vipBuyIn),
  };
}

export type ChargeLine = { count: number; price: number; sum: number };

export type PlayerCharge = {
  addons: ChargeLine;
  /** A double re-entry is priced apart from a single one. */
  doubleReentries: ChargeLine;
  reentries: ChargeLine;
  ticket: ChargeLine & { free: boolean };
  total: number;
};

function toCount(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function line(count: number, price: number): ChargeLine {
  return { count, price, sum: count * price };
}

/**
 * The venue's owner plays on the house. What he buys is still counted — the screen, the
 * chip bank and the game sheet all see his re-entries and add-ons — but the bill for
 * the seat and for every one of them stays at zero.
 */
const VENUE_OWNER_NICKNAME = "киберпсих";

/**
 * What a player owes for the evening.
 *
 * The entry is free when the club gave them a pass or the tournament is a freeroll;
 * re-entries and add-ons are always paid for, since a pass covers the seat only, and a
 * "1+1" halves the entry alone for the same reason. The venue's owner alone pays for
 * nothing at all.
 */
export function buildPlayerCharge(
  player: Pick<
    TournamentPlayer,
    "addons" | "doubleRebuys" | "duoTicket" | "freePass" | "rebuys" | "ticketType"
  > &
    Partial<Pick<TournamentPlayer, "name">>,
  prices: FinancePrices,
  options: { freeroll?: boolean } = {},
): PlayerCharge {
  const doubleReentries = toCount(player.doubleRebuys);
  // `rebuys` counts every re-entry, doubles included, and the two are priced apart.
  const reentries = Math.max(0, toCount(player.rebuys) - doubleReentries);
  const addons = toCount(player.addons);

  const onTheHouse = String(player.name ?? "").trim().toLowerCase() === VENUE_OWNER_NICKNAME;
  const charged = (price: number) => (onTheHouse ? 0 : price);

  const paidWithPass = player.freePass === "regular" || player.freePass === "vip";
  const free = paidWithPass || Boolean(options.freeroll);
  // A "1+1" is one ticket for two, and the pair splits what it costs: each of them owes
  // half, whichever of the two bought it.
  const ticketPrice = player.duoTicket
    ? Math.round(prices.duoBuyIn / 2)
    : player.ticketType === "vip"
      ? prices.vipBuyIn
      : prices.buyIn;
  const ticket = { ...line(free ? 0 : 1, free ? 0 : charged(ticketPrice)), free };

  const charge = {
    addons: line(addons, charged(prices.addonPrice)),
    doubleReentries: line(doubleReentries, charged(prices.doubleRebuyPrice)),
    reentries: line(reentries, charged(prices.rebuyPrice)),
    ticket,
  };

  return {
    ...charge,
    total:
      charge.ticket.sum + charge.reentries.sum + charge.doubleReentries.sum + charge.addons.sum,
  };
}
