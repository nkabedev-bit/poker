import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

export type FinancePrices = {
  addonPrice: number;
  buyIn: number;
  doubleRebuyPrice: number;
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
 * What a player owes for the evening.
 *
 * The entry is free when the club gave them a pass or the tournament is a freeroll;
 * re-entries and add-ons are always paid for, since a pass covers the seat only.
 */
export function buildPlayerCharge(
  player: Pick<TournamentPlayer, "addons" | "doubleRebuys" | "freePass" | "rebuys" | "ticketType">,
  prices: FinancePrices,
  options: { freeroll?: boolean } = {},
): PlayerCharge {
  const doubleReentries = toCount(player.doubleRebuys);
  // `rebuys` counts every re-entry, doubles included, and the two are priced apart.
  const reentries = Math.max(0, toCount(player.rebuys) - doubleReentries);
  const addons = toCount(player.addons);

  const paidWithPass = player.freePass === "regular" || player.freePass === "vip";
  const free = paidWithPass || Boolean(options.freeroll);
  const ticketPrice = player.ticketType === "vip" ? prices.vipBuyIn : prices.buyIn;
  const ticket = { ...line(free ? 0 : 1, free ? 0 : ticketPrice), free };

  const charge = {
    addons: line(addons, prices.addonPrice),
    doubleReentries: line(doubleReentries, prices.doubleRebuyPrice),
    reentries: line(reentries, prices.rebuyPrice),
    ticket,
  };

  return {
    ...charge,
    total:
      charge.ticket.sum + charge.reentries.sum + charge.doubleReentries.sum + charge.addons.sum,
  };
}
