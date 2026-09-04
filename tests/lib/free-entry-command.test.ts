import { describe, expect, it } from "vitest";
import { describeFreeEntries, parseFreeEntryCommand } from "@/lib/free-entries/command";

describe("parseFreeEntryCommand", () => {
  it("gives one regular pass when only a nickname is named", () => {
    expect(parseFreeEntryCommand("/free Ace")).toEqual({ count: 1, nickname: "Ace", source: "manual", vip: false });
  });

  it("reads how many passes to give", () => {
    expect(parseFreeEntryCommand("/free Ace 3")).toMatchObject({ count: 3, nickname: "Ace" });
  });

  it("marks a VIP pass, whatever the case", () => {
    expect(parseFreeEntryCommand("/free VIP Ace 2")).toEqual({ count: 2, nickname: "Ace", source: "manual", vip: true });
    expect(parseFreeEntryCommand("/free vip Ace")).toMatchObject({ vip: true });
  });

  // Club nicknames have spaces in them, so the count is recognised by shape, not position.
  it("keeps a nickname made of several words", () => {
    expect(parseFreeEntryCommand("/free Старый узбек 3")).toEqual({
      count: 3,
      nickname: "Старый узбек",
      source: "manual",
      vip: false,
    });
  });

  it("keeps a nickname that ends in a word when no count is given", () => {
    expect(parseFreeEntryCommand("/free vip Старый узбек")).toMatchObject({
      count: 1,
      nickname: "Старый узбек",
    });
  });

  it("reads the delete twin the same way", () => {
    expect(parseFreeEntryCommand("/delete free vip Ace High 2")).toEqual({
      count: 2,
      nickname: "Ace High",
      source: "manual",
      vip: true,
    });
    expect(parseFreeEntryCommand("/deletefree Ace")).toMatchObject({ nickname: "Ace" });
  });

  it("survives the @botname Telegram appends in groups", () => {
    expect(parseFreeEntryCommand("/free@MajesticBot Ace 2")).toMatchObject({
      count: 2,
      nickname: "Ace",
    });
  });

  // Why the pass was given is what the "Проходки" ledger records.
  it("reads the mystery bounty reason, in either order", () => {
    expect(parseFreeEntryCommand("/free mystery Ace")).toMatchObject({
      nickname: "Ace",
      source: "mystery",
      vip: false,
    });
    expect(parseFreeEntryCommand("/free vip мистери Старый узбек 2")).toMatchObject({
      count: 2,
      nickname: "Старый узбек",
      source: "mystery",
      vip: true,
    });
    expect(parseFreeEntryCommand("/free mystery vip Ace")).toMatchObject({
      source: "mystery",
      vip: true,
    });
  });

  it("refuses a command with no nickname", () => {
    expect(parseFreeEntryCommand("/free")).toBeNull();
    expect(parseFreeEntryCommand("/free vip")).toBeNull();
    expect(parseFreeEntryCommand("/free   ")).toBeNull();
    expect(parseFreeEntryCommand("/free mystery")).toBeNull();
  });

  it("treats a nickname that is only digits as a nickname, not a count", () => {
    expect(parseFreeEntryCommand("/free 123")).toMatchObject({ count: 1, nickname: "123" });
  });

  it("caps an absurd number", () => {
    expect(parseFreeEntryCommand("/free Ace 9999")?.count).toBe(50);
  });
});

describe("describeFreeEntries", () => {
  it("agrees with the number", () => {
    expect(describeFreeEntries(1, false)).toBe("1 проходка");
    expect(describeFreeEntries(3, false)).toBe("3 проходки");
    expect(describeFreeEntries(5, false)).toBe("5 проходок");
    expect(describeFreeEntries(2, true)).toBe("2 VIP-проходки");
  });
});
