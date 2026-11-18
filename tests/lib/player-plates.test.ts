import { describe, expect, it } from "vitest";
import { listHonorPlates } from "@/lib/players/plate-honors";
import {
  canUsePlate,
  describePlateLock,
  PLATE_FORMS,
  readPlateChoice,
  resolveShownPlate,
} from "@/lib/players/plates";

const SECRET = "866d67e0-aa90-4170-a1f2-3bb16e344ec9";
const SELLER = "ca9b21dc-aacc-42cf-b7dd-d2e455f31120";

function formsOpenTo(tier: Parameters<typeof canUsePlate>[1]["tier"]) {
  return PLATE_FORMS.filter((form) => canUsePlate(form.id, { honors: [], tier })).map(
    (form) => form.id,
  );
}

describe("player plates", () => {
  it("opens three shapes a tier, four for a champion", () => {
    expect(formsOpenTo(null)).toEqual([]);
    expect(formsOpenTo("member")).toEqual(["button", "bluff", "flop"]);
    expect(formsOpenTo("core")).toHaveLength(6);
    expect(formsOpenTo("legend")).toHaveLength(9);
    expect(formsOpenTo("champion")).toEqual([
      "button", "bluff", "flop",
      "all_in", "chip_leader", "straight",
      "satellite", "quads", "gatsby",
      "jackpot", "nuts", "triumph", "royal_flush",
    ]);
  });

  it("gives the APC plates by account, whatever the tier", () => {
    expect(listHonorPlates(SECRET)).toEqual(["apc", "apc_second"]);
    expect(listHonorPlates(SELLER)).toEqual(["apc", "championship", "championship_finalist"]);
    expect(listHonorPlates("someone")).toEqual([]);
    expect(listHonorPlates(null)).toEqual([]);

    expect(canUsePlate("apc", { honors: listHonorPlates(SELLER), tier: null })).toBe(true);
    expect(canUsePlate("apc", { honors: [], tier: "champion" })).toBe(false);
    expect(canUsePlate("apc_second", { honors: listHonorPlates(SECRET), tier: null })).toBe(true);
    expect(canUsePlate("apc_second", { honors: listHonorPlates(SELLER), tier: "legend" })).toBe(false);
  });

  it("gives the championship plates by account, the finalist's to Seller alone", () => {
    const holders = {
      chura: "842afd72-e8f7-4e3d-afbe-ddcc68ce8e31",
      cyberpsycho: "3b85b827-b657-44aa-ae96-799dafa6e77e",
      hunte: "0f78d620-c69b-4c02-82e2-b2d7ad6cbe1e",
    };

    expect(listHonorPlates(holders.cyberpsycho)).toEqual(["championship"]);
    expect(listHonorPlates(holders.hunte)).toEqual(["apc", "championship"]);
    expect(listHonorPlates(holders.chura)).toEqual(["apc"]);
    expect(canUsePlate("championship", { honors: [], tier: "champion" })).toBe(false);
    expect(
      canUsePlate("championship_finalist", { honors: listHonorPlates(holders.hunte), tier: "champion" }),
    ).toBe(false);
    expect(readPlateChoice("championship_finalist", "teal")).toEqual({
      color: null,
      form: "championship_finalist",
    });
  });

  it("reads a stored pick back, dropping the colour of a plate with its own art", () => {
    expect(readPlateChoice("quads", "teal")).toEqual({ color: "teal", form: "quads" });
    expect(readPlateChoice("quads", "gold")).toEqual({ color: "ruby", form: "quads" });
    expect(readPlateChoice("apc", "teal")).toEqual({ color: null, form: "apc" });
    expect(readPlateChoice("crown", "teal")).toBeNull();
    expect(readPlateChoice(null, null)).toBeNull();
  });

  it("shows the tier's plate while the tier no longer opens the pick, and keeps the pick", () => {
    const pick = { color: "ruby" as const, form: "gatsby" as const };

    expect(resolveShownPlate(pick, { honors: [], tier: "legend" })).toEqual(pick);
    expect(resolveShownPlate(pick, { honors: [], tier: "core" })).toBeNull();
    expect(resolveShownPlate(null, { honors: [], tier: "legend" })).toBeNull();
  });

  it("tells a player how far a locked shape is", () => {
    expect(describePlateLock("all_in", 13)).toBe("Откроется на CORE — ещё 7 игр");
    expect(describePlateLock("button", 4)).toBe("Откроется на MEMBER — ещё 1 игра");
    expect(describePlateLock("quads", 48)).toBe("Откроется на LEGEND — ещё 2 игры");
    expect(describePlateLock("nuts", 300)).toBe("Только со статусом CHAMPION");
  });
});
