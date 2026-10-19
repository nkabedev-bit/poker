import { describe, expect, it } from "vitest";
import {
  canManageFreeEntries,
  describeFreeEntries,
  parseFreeEntryCommand,
} from "@/lib/free-entries/command";

describe("parseFreeEntryCommand", () => {
  it("gives one regular pass when only a nickname is named", () => {
    expect(parseFreeEntryCommand("/free Ace")).toEqual({ count: 1, nickname: "Ace" });
  });

  it("reads how many passes to give", () => {
    expect(parseFreeEntryCommand("/free Ace 3")).toMatchObject({ count: 3, nickname: "Ace" });
  });

  // Club nicknames have spaces in them, so the count is recognised by shape, not position.
  it("keeps a nickname made of several words", () => {
    expect(parseFreeEntryCommand("/free Старый узбек 3")).toEqual({
      count: 3,
      nickname: "Старый узбек",
    });
  });

  it("keeps a nickname that ends in a word when no count is given", () => {
    expect(parseFreeEntryCommand("/free Старый узбек")).toMatchObject({
      count: 1,
      nickname: "Старый узбек",
    });
  });

  it("reads the delete twin the same way", () => {
    expect(parseFreeEntryCommand("/delete free Ace High 2")).toEqual({
      count: 2,
      nickname: "Ace High",
    });
    expect(parseFreeEntryCommand("/deletefree Ace")).toMatchObject({ nickname: "Ace" });
  });

  it("survives the @botname Telegram appends in groups", () => {
    expect(parseFreeEntryCommand("/free@MajesticBot Ace 2")).toMatchObject({
      count: 2,
      nickname: "Ace",
    });
  });

  it("refuses a command with no nickname", () => {
    expect(parseFreeEntryCommand("/free")).toBeNull();
    expect(parseFreeEntryCommand("/free   ")).toBeNull();
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
    expect(describeFreeEntries(1)).toBe("1 проходка");
    expect(describeFreeEntries(3)).toBe("3 проходки");
    expect(describeFreeEntries(5)).toBe("5 проходок");
    expect(describeFreeEntries(21)).toBe("21 проходка");
  });
});

describe("who may hand out a free entry", () => {
  const manager = 384428007;

  it("lets the one admin the club named", () => {
    expect(canManageFreeEntries(manager)).toBe(true);
  });

  // Passes are money, and the owner asked to be taken off the list: an owner who cannot
  // give one away cannot be talked into it either.
  it("refuses everybody else, the club owner included", () => {
    expect(canManageFreeEntries(1)).toBe(false);
    expect(canManageFreeEntries(0)).toBe(false);
    expect(canManageFreeEntries(undefined)).toBe(false);
  });
});
