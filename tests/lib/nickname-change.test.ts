import { describe, expect, it, vi } from "vitest";
import { pickProfileSheetRowsToRename } from "@/lib/google-sheets";
import {
  describeNicknameRefusal,
  nextNicknameChangeAt,
  parseNewNickname,
  readLastNicknameChange,
  recentFormerNickname,
} from "@/lib/players/nickname-change";

describe("a new nickname typed by the player", () => {
  it("is kept as typed, with the spaces tidied", () => {
    expect(parseNewNickname("  Big   Fish ")).toEqual({ nickname: "Big Fish" });
    expect(parseNewNickname("Ёжик")).toEqual({ nickname: "Ёжик" });
  });

  it("is turned down when too short or too long", () => {
    expect(parseNewNickname("A")).toEqual({ message: "Ник — не короче 2 символов." });
    expect(parseNewNickname("x".repeat(41))).toEqual({ message: "Ник — не длиннее 40 символов." });
  });

  it("needs a letter or a digit, or nothing could find the player's games under it", () => {
    expect(parseNewNickname("!!! ???")).toEqual({
      message: "В нике нужна хотя бы одна буква или цифра.",
    });
  });

  it.each(["=IMAGE(1)", "+79001234567", "-Fox-", "@SUM(A1)", "  =1+1"])(
    "is turned down when the spreadsheet would run %s as a formula",
    (value) => {
      expect(parseNewNickname(value)).toEqual({ message: "Ник не может начинаться с =, +, - или @." });
    },
  );

  it("keeps those signs anywhere but at the start", () => {
    expect(parseNewNickname("Fox-1")).toEqual({ nickname: "Fox-1" });
    expect(parseNewNickname("A=B")).toEqual({ nickname: "A=B" });
  });

  it("is turned down when it is not text at all", () => {
    expect(parseNewNickname(undefined)).toEqual({ message: "Ник — не короче 2 символов." });
    expect(parseNewNickname(42)).toEqual({ message: "Ник — не короче 2 символов." });
  });
});

describe("why the club turned a nickname down", () => {
  it("names the day the next change opens", () => {
    expect(describeNicknameRefusal("cooldown", "2026-11-08T09:00:00.000Z")).toBe(
      "Ник можно менять раз в 30 дней. Следующая смена — с 8 ноября.",
    );
  });

  it("explains each refusal of the database", () => {
    expect(describeNicknameRefusal("taken")).toBe("Этот ник уже занят. Выберите другой.");
    expect(describeNicknameRefusal("in_game")).toBe(
      "Вы в рассадке турнира. Сменить ник можно после его окончания.",
    );
    expect(describeNicknameRefusal("same")).toBe("Это ваш текущий ник.");
    expect(describeNicknameRefusal("something new")).toBe("Не удалось сменить ник. Попробуйте ещё раз.");
  });
});

describe("the thirty days after a change", () => {
  const change = { changedAt: "2026-10-09T10:00:00.000Z", oldName: "Mr.Fish" };

  it("close the next change until they are over", () => {
    expect(nextNicknameChangeAt(change, new Date("2026-10-20T00:00:00.000Z"))).toBe(
      "2026-11-08T10:00:00.000Z",
    );
    expect(nextNicknameChangeAt(change, new Date("2026-11-08T10:00:00.000Z"))).toBeNull();
    expect(nextNicknameChangeAt(null)).toBeNull();
  });

  it("show the old nickname to the room, and then stop", () => {
    expect(recentFormerNickname(change, new Date("2026-10-20T00:00:00.000Z"))).toBe("Mr.Fish");
    expect(recentFormerNickname(change, new Date("2026-11-09T00:00:00.000Z"))).toBeNull();
    expect(recentFormerNickname(null)).toBeNull();
  });
});

describe("reading the latest change", () => {
  function journal(result: { data: unknown; error: unknown }) {
    const query = {
      eq: vi.fn(() => query),
      limit: vi.fn(async () => result),
      order: vi.fn(() => query),
      select: vi.fn(() => query),
    };
    return { from: vi.fn(() => query) };
  }

  it("returns the player's last change", async () => {
    const supabase = journal({
      data: [{ changed_at: "2026-10-09T10:00:00.000Z", old_name: "Mr.Fish" }],
      error: null,
    });

    await expect(readLastNicknameChange(supabase as never, "account-1")).resolves.toEqual({
      changedAt: "2026-10-09T10:00:00.000Z",
      oldName: "Mr.Fish",
    });
  });

  it("knows of none while the journal is not there yet", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const supabase = journal({ data: null, error: { message: 'relation "nickname_changes" does not exist' } });

    await expect(readLastNicknameChange(supabase as never, "account-1")).resolves.toBeNull();
    warn.mockRestore();
  });
});

describe("the questionnaire rows renamed with the player", () => {
  const header = ["Дата", "Username", "Telegram ID", "Имя", "Игровой никнейм"];

  it("are the player's by Telegram ID, whatever nickname they carry", () => {
    const grid = [
      header,
      ["01.09", "@fish", "874191714", "Иван", "Mr.Fish"],
      ["02.09", "@fish", "874191714", "Иван", "Fishy"],
      ["03.09", "@other", "555", "Пётр", "Somebody"],
    ];

    expect(pickProfileSheetRowsToRename(grid, { oldName: "Mr.Fish", telegramId: 874191714 })).toEqual([1, 2]);
  });

  it("are found by the old nickname when the row has no Telegram ID", () => {
    const grid = [header, ["01.09", "", "", "Анна", "web guy"], ["02.09", "", "", "Борис", "Other"]];

    expect(pickProfileSheetRowsToRename(grid, { oldName: "WebGuy", telegramId: null })).toEqual([1]);
  });

  it("leave alone a row under the old nickname with somebody else's Telegram ID", () => {
    const grid = [header, ["01.09", "@other", "555", "Пётр", "Mr.Fish"]];

    expect(pickProfileSheetRowsToRename(grid, { oldName: "Mr.Fish", telegramId: 874191714 })).toEqual([]);
  });

  it("never take the header for a player", () => {
    expect(pickProfileSheetRowsToRename([header], { oldName: "Игровой никнейм", telegramId: null })).toEqual([]);
  });
});
