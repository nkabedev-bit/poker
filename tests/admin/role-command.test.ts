import { describe, expect, it } from "vitest";
import { buildRoleChangedReply, parseRoleCommand } from "@/lib/admin-bot/role-command";

describe("parseRoleCommand", () => {
  it("reads the admin's id and the role in Russian", () => {
    expect(parseRoleCommand("/role 123456789 дилер")).toEqual({ role: "dealer", telegramId: 123456789 });
  });

  it("reads the role in English and the bot-addressed form", () => {
    expect(parseRoleCommand("/role@MajesticAdminBot 42 Floor")).toEqual({ role: "floor", telegramId: 42 });
  });

  it("refuses the command without its words", () => {
    expect(parseRoleCommand("/role")).toBeNull();
    expect(parseRoleCommand("/role 42")).toBeNull();
  });

  it("refuses an unknown role and a swapped order", () => {
    expect(parseRoleCommand("/role 42 админ")).toBeNull();
    expect(parseRoleCommand("/role дилер 42")).toBeNull();
  });
});

describe("buildRoleChangedReply", () => {
  it("says what a dealer keeps", () => {
    expect(buildRoleChangedReply("Аня", 42, "dealer")).toContain("Аня (42) теперь дилер: только «Зал» и «Вылеты»");
  });

  it("says a floor gets everything", () => {
    expect(buildRoleChangedReply("Борис", 7, "floor")).toContain("теперь флор: полный доступ");
  });
});
