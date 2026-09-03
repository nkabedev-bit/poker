import { describe, expect, it } from "vitest";
import { buildNicknameKey } from "@/lib/players/nickname-key";

describe("buildNicknameKey", () => {
  it("reads one player behind every spelling of their nickname", () => {
    expect(buildNicknameKey("Kabedev")).toBe(buildNicknameKey("kabedev"));
    expect(buildNicknameKey("adam_smasher")).toBe(buildNicknameKey("ADAM SMASHER"));
    expect(buildNicknameKey("MDG-killer")).toBe(buildNicknameKey("mdg killer"));
    expect(buildNicknameKey(" ЮРАН ")).toBe(buildNicknameKey("юран"));
  });

  it("keeps different players apart", () => {
    expect(buildNicknameKey("TitAn")).not.toBe(buildNicknameKey("Titan2"));
    expect(buildNicknameKey("chak")).not.toBe(buildNicknameKey("chack"));
  });

  it("keeps the digits a nickname is made of", () => {
    expect(buildNicknameKey("123")).toBe("123");
  });

  it("comes out empty when nothing but punctuation was typed", () => {
    expect(buildNicknameKey("  _- ")).toBe("");
  });
});
