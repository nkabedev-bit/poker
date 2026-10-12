import { describe, expect, it } from "vitest";
import { getPlayerHonor } from "@/lib/players/player-honor";

describe("getPlayerHonor", () => {
  it("gives Secret the APC Side Event plate, however the nickname is written", () => {
    expect(getPlayerHonor("Secret")).toBe("2-ое место в Side Event APC");
    expect(getPlayerHonor("SECRET ")).toBe("2-ое место в Side Event APC");
  });

  it("gives nobody else a plate", () => {
    expect(getPlayerHonor("kabedev")).toBeNull();
    expect(getPlayerHonor("Secret Agent")).toBeNull();
    expect(getPlayerHonor(null)).toBeNull();
    expect(getPlayerHonor(undefined)).toBeNull();
  });
});
