import { describe, expect, it } from "vitest";
import { allowPlayerDebt, denyPlayerDebt, parseDebtCommand } from "@/lib/admin-bot/debt-allow-command";
import { fakeSupabase } from "../debts/fake-supabase";

const NOW = new Date("2026-10-07T12:00:00.000Z");

function club() {
  return fakeSupabase({
    client_bot_users: [
      { debt_allowed_by: null, debt_allowed_until: null, display_name: "Secret", id: "acc-secret", nickname_key: "secret" },
      // A nickname that ends in a number, which must not be read as days.
      { debt_allowed_by: null, debt_allowed_until: null, display_name: "Mers cls 055", id: "acc-mers", nickname_key: "merscls055" },
      { debt_allowed_by: null, debt_allowed_until: null, display_name: "Clean", id: "acc-clean", nickname_key: "clean" },
    ],
    debt_payments: [],
    player_debts: [
      { amount: 16000, debtor_key: "acc-secret", game_started_at: "2026-09-29T16:00:00.000Z", id: "d1" },
      { amount: 2500, debtor_key: "acc-mers", game_started_at: "2026-09-29T16:00:00.000Z", id: "d2" },
    ],
  });
}

describe("parseDebtCommand", () => {
  it("reads what follows the command", () => {
    expect(parseDebtCommand("/allowdebt Secret 3")).toBe("Secret 3");
    expect(parseDebtCommand("/denydebt@poker_ptz_bot Даня Хэнс")).toBe("Даня Хэнс");
    expect(parseDebtCommand("/allowdebt")).toBeNull();
  });
});

describe("allowPlayerDebt", () => {
  it("lets the player in for the days asked and remembers who asked", async () => {
    const db = club();

    const reply = await allowPlayerDebt(db.client, { adminId: 511564749, now: NOW, rest: "Secret 3" });

    expect(reply).toContain("«Secret» может записываться на игры до 10.10");
    expect(reply).toContain("16 000 ₽");
    expect(db.tables.client_bot_users[0]).toMatchObject({
      debt_allowed_by: 511564749,
      debt_allowed_until: "2026-10-10T12:00:00.000Z",
    });
  });

  it("gives a week when no days are named", async () => {
    const db = club();

    await allowPlayerDebt(db.client, { adminId: 1, now: NOW, rest: "Secret" });

    expect(db.tables.client_bot_users[0].debt_allowed_until).toBe("2026-10-14T12:00:00.000Z");
  });

  it("reads a nickname ending in a number as the nickname", async () => {
    const db = club();

    await allowPlayerDebt(db.client, { adminId: 1, now: NOW, rest: "Mers cls 055" });

    expect(db.tables.client_bot_users[1].debt_allowed_until).toBe("2026-10-14T12:00:00.000Z");
  });

  it("does nothing for a player who owes nothing", async () => {
    const db = club();

    expect(await allowPlayerDebt(db.client, { adminId: 1, now: NOW, rest: "Clean" })).toBe(
      "У «Clean» нет долга — запись и так открыта.",
    );
    expect(db.tables.client_bot_users[2].debt_allowed_by).toBeNull();
  });

  it("says when nobody carries the nickname", async () => {
    expect(await allowPlayerDebt(club().client, { adminId: 1, now: NOW, rest: "Nobody" })).toBe(
      "Игрок «Nobody» не найден среди анкет.",
    );
  });
});

describe("denyPlayerDebt", () => {
  it("takes the permission back and says the door is shut again", async () => {
    const db = club();
    await allowPlayerDebt(db.client, { adminId: 1, now: NOW, rest: "Secret" });

    const reply = await denyPlayerDebt(db.client, "Secret");

    expect(reply).toBe("Разрешение для «Secret» снято. Долг 16 000 ₽ — запись на игры закрыта.");
    expect(db.tables.client_bot_users[0]).toMatchObject({ debt_allowed_by: null, debt_allowed_until: null });
  });
});
