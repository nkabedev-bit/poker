import { describe, expect, it } from "vitest";
import { buildFinanceSheetGrid, buildFinanceSheetRows, getFinancePrices } from "@/lib/google-sheets";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentPlayer } from "@/lib/timer/types";

const prices = {
  addonPrice: 1250,
  buyIn: 1250,
  doubleRebuyPrice: 2000,
  rebuyPrice: 1250,
  vipBuyIn: 2000,
};

function player(
  registrationNumber: number,
  name: string,
  overrides: Partial<TournamentPlayer> = {},
): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: `player-${registrationNumber}`,
    name,
    rebuys: 0,
    registrationNumber,
    seat: null,
    stack: 20000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

describe("finance sheet", () => {
  it("charges the ticket once and prices re-entries, doubles and addons apart", () => {
    const rows = buildFinanceSheetRows(
      [player(1, "Иван", { addons: 1, doubleRebuys: 1, rebuys: 3 })],
      prices,
    );

    // Ticket 1250 + two single re-entries 2500 + one double 2000 + one addon 1250.
    expect(rows[0]).toEqual([1, "Иван", 1250, 2, 2500, 1, 2000, 1, 1250, 7000]);
  });

  // A pass covers the seat, so the sheet must not ask for the ticket a second time.
  it("writes no entry money for a player who came in on a free pass", () => {
    const rows = buildFinanceSheetRows(
      [player(3, "Проходка", { addons: 1, freePass: "regular", rebuys: 1 })],
      prices,
    );

    expect(rows[0]?.[2]).toBe("");
    expect(rows[0]?.[9]).toBe(2500);
  });

  it("charges the VIP price only for a VIP ticket sold at the door", () => {
    const rows = buildFinanceSheetRows(
      [player(21, "ВИП", { ticketType: "vip" }), player(2, "Обычный", { ticketType: "regular" })],
      prices,
    );

    expect(rows[0]?.[2]).toBe(1250);
    expect(rows[1]?.[2]).toBe(2000);
  });

  it("charges no entry in a FREEROLL but still counts re-entries and addons", () => {
    const rows = buildFinanceSheetRows(
      [player(1, "Иван", { addons: 1, rebuys: 1, ticketType: "vip" })],
      prices,
      { freeEntry: true },
    );

    expect(rows[0]).toEqual([1, "Иван", "", 1, 1250, "", "", 1, 1250, 2500]);
  });

  it("sums every category in the totals row", () => {
    const rows = buildFinanceSheetRows(
      [
        player(1, "Иван", { rebuys: 1 }),
        player(2, "Пётр", { addons: 1, doubleRebuys: 1, rebuys: 1 }),
      ],
      prices,
    );
    const totals = rows.at(-1);

    expect(totals?.[1]).toBe("ИТОГО");
    // Two tickets, one single re-entry, one double, one addon.
    expect(totals?.[2]).toBe(2500);
    expect(totals?.[3]).toBe(1);
    expect(totals?.[4]).toBe(1250);
    expect(totals?.[5]).toBe(1);
    expect(totals?.[6]).toBe(2000);
    expect(totals?.[8]).toBe(1250);
    expect(totals?.[9]).toBe(7000);
  });

  it("sorts players by registration number and keeps the header row first", () => {
    const grid = buildFinanceSheetGrid([player(3, "Третий"), player(1, "Первый")], prices);

    expect(grid[0]?.[0]).toBe("№");
    expect(grid[1]?.[1]).toBe("Первый");
    expect(grid[2]?.[1]).toBe("Третий");
  });

  it("writes no rows at all for an empty roster", () => {
    expect(buildFinanceSheetRows([], prices)).toEqual([]);
  });

  it("reads the prices from the tournament settings", () => {
    const extras = mergeTournamentExtras({
      settings: { addonPrice: 1250, buyIn: 1250, doubleRebuyPrice: 2000, rebuyPrice: 1250, vipBuyIn: 2000 },
    });

    expect(getFinancePrices(extras.settings)).toEqual(prices);
  });

  it("treats a missing or negative price as zero instead of NaN", () => {
    expect(getFinancePrices({ buyIn: -100 })).toEqual({
      addonPrice: 0,
      buyIn: 0,
      doubleRebuyPrice: 0,
      rebuyPrice: 0,
      vipBuyIn: 0,
    });
  });
});
