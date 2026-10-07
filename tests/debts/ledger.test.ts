import { describe, expect, it } from "vitest";
import {
  buildDebtBlockMessage,
  buildDebtorKey,
  buildDebtReminderMessage,
  buildEveningDebts,
  changedFinanceMarks,
  type DebtCharge,
  debtBlocksFrom,
  type DebtPayment,
  describeFinancePayment,
  isBlockingDebt,
  settleCharges,
  sumLeft,
  unpaidCharges,
} from "@/lib/debts/ledger";
import type { FinancePrices } from "@/lib/finance/player-charge";
import type { TournamentPlayer } from "@/lib/timer/types";

function charge(gameStartedAt: string, amount: number, extra: Partial<DebtCharge> = {}): DebtCharge {
  return {
    accountId: "acc-1",
    amount,
    blocksFrom: debtBlocksFrom(gameStartedAt),
    debtorKey: "acc-1",
    gameStartedAt,
    id: `charge-${gameStartedAt}`,
    playerName: "Secret",
    remind: true,
    source: "app",
    ...extra,
  };
}

function payment(amount: number, createdAt: string, extra: Partial<DebtPayment> = {}): DebtPayment {
  return {
    amount,
    cancelledAt: null,
    createdAt,
    debtorKey: "acc-1",
    id: `pay-${createdAt}`,
    kind: "payment",
    playerName: "Secret",
    recordedBy: 384428007,
    ...extra,
  };
}

const SEP_27 = "2026-09-27T16:00:00.000Z";
const SEP_29 = "2026-09-29T16:00:00.000Z";
const OCT_01 = "2026-10-01T16:00:00.000Z";

describe("debtBlocksFrom", () => {
  it("closes sign-ups at noon in Moscow the day after the game", () => {
    expect(debtBlocksFrom("2026-10-08T16:00:00.000Z")).toBe("2026-10-09T09:00:00.000Z");
  });

  // A game that started late in the evening is still that evening's game.
  it("counts the day by Moscow time, not by UTC", () => {
    expect(debtBlocksFrom("2026-10-08T21:30:00.000Z")).toBe("2026-10-10T09:00:00.000Z");
  });
});

describe("settleCharges", () => {
  // The case the club asked for: owes 6 500, brings 5 000.
  it("spreads part of the money over the oldest evenings first", () => {
    const settled = settleCharges(
      [charge(SEP_29, 2500), charge(SEP_27, 4000)],
      [payment(5000, "2026-10-05T10:00:00.000Z")],
    );

    expect(settled.map((item) => [item.gameStartedAt, item.left])).toEqual([
      [SEP_27, 0],
      [SEP_29, 1500],
    ]);
    expect(sumLeft(settled)).toBe(1500);
  });

  it("does not count a payment taken back by mistake", () => {
    const settled = settleCharges(
      [charge(SEP_27, 4000)],
      [payment(4000, "2026-10-05T10:00:00.000Z", { cancelledAt: "2026-10-05T10:01:00.000Z" })],
    );

    expect(sumLeft(settled)).toBe(4000);
  });

  it("keeps money paid apart from money let go", () => {
    const [settled] = settleCharges(
      [charge(SEP_27, 4000)],
      [
        payment(1000, "2026-10-05T10:00:00.000Z"),
        payment(3000, "2026-10-06T10:00:00.000Z", { kind: "writeoff" }),
      ],
    );

    expect(settled).toMatchObject({ left: 0, paid: 1000, writtenOff: 3000 });
  });
});

describe("isBlockingDebt", () => {
  const settled = settleCharges([charge(OCT_01, 2500)], []);

  it("leaves the night after the game to pay", () => {
    expect(isBlockingDebt(settled, new Date("2026-10-02T08:59:00.000Z"))).toBe(false);
  });

  it("closes sign-ups from noon", () => {
    expect(isBlockingDebt(settled, new Date("2026-10-02T09:00:00.000Z"))).toBe(true);
  });

  it("opens them again once everything is paid", () => {
    const paid = settleCharges([charge(OCT_01, 2500)], [payment(2500, "2026-10-02T10:00:00.000Z")]);
    expect(isBlockingDebt(paid, new Date("2026-10-03T12:00:00.000Z"))).toBe(false);
  });
});

describe("what the player reads", () => {
  it("names the evening, the sum and whom to write to", () => {
    const unpaid = unpaidCharges(settleCharges([charge(SEP_29, 2500)], []));

    expect(buildDebtBlockMessage(unpaid)).toBe(
      "За игру 29.09 не оплачено 2 500 ₽. Пока долг не закрыт, запись на турниры недоступна. " +
        "Напишите, пожалуйста, @markvasilyevv",
    );
  });

  it("lists every evening still open, with what is left of them", () => {
    const unpaid = unpaidCharges(
      settleCharges([charge(SEP_27, 4000), charge(SEP_29, 5000)], [payment(1000, "2026-10-01T10:00:00.000Z")]),
    );

    expect(buildDebtReminderMessage(unpaid)).toBe(
      "Напоминаем: за игры 27.09, 29.09 не оплачено 8 000 ₽. Пока долг не закрыт, " +
        "запись на турниры недоступна. Напишите, пожалуйста, @markvasilyevv",
    );
  });
});

describe("the finance sheet's «Оплатил» cell", () => {
  it("says how much of an evening is paid", () => {
    const [partly] = settleCharges([charge(SEP_27, 2500)], [payment(1500, "2026-10-01T10:00:00.000Z")]);
    expect(describeFinancePayment(partly)).toBe("Частично 1 500 из 2 500");
  });

  it("writes only the evenings a payment changed", () => {
    const charges = [charge(SEP_27, 2500), charge(SEP_29, 2500)];
    const before = settleCharges(charges, []);
    const after = settleCharges(charges, [payment(2500, "2026-10-01T10:00:00.000Z")]);

    expect(changedFinanceMarks({ after, before })).toEqual([
      { gameStartedAt: SEP_27, playerName: "Secret", status: "Да" },
    ]);
  });

  it("marks an evening the club let go", () => {
    const [writtenOff] = settleCharges(
      [charge(SEP_27, 2500)],
      [payment(2500, "2026-10-01T10:00:00.000Z", { kind: "writeoff" })],
    );
    expect(describeFinancePayment(writtenOff)).toBe("Списан");
  });
});

describe("buildEveningDebts", () => {
  const prices: FinancePrices = {
    addonPrice: 1000,
    buyIn: 1250,
    doubleRebuyPrice: 2000,
    duoBuyIn: 2000,
    rebuyPrice: 1250,
    vipBuyIn: 2000,
  };

  function seat(extra: Partial<TournamentPlayer>): TournamentPlayer {
    return {
      addons: 0,
      bountyCount: 0,
      finishPlace: null,
      id: extra.name ?? "p",
      name: "Player",
      rebuys: 0,
      registrationNumber: 1,
      seat: 1,
      stack: 0,
      status: "eliminated",
      table: 1,
      ...extra,
    } as TournamentPlayer;
  }

  it("bills only who came, did not pay, and owes above zero", () => {
    const owed = buildEveningDebts(
      [
        seat({ name: "Owes", rebuys: 1 }),
        seat({ name: "Paid", paid: true }),
        seat({ name: "Never came", registrationNumber: null }),
        seat({ freePass: "regular", name: "Pass" }),
        seat({ name: "Киберпсих", rebuys: 2 }),
      ],
      prices,
    );

    expect(owed.map((item) => [item.player.name, item.amount])).toEqual([["Owes", 2500]]);
  });
});

describe("buildDebtorKey", () => {
  it("keys a guest by nickname so the desk still finds them", () => {
    expect(buildDebtorKey(null, "Даня Хэнс")).toBe("name:даняхэнс");
    expect(buildDebtorKey("acc-9", "Даня Хэнс")).toBe("acc-9");
  });
});
