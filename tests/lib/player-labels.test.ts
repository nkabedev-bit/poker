import { describe, expect, it } from "vitest";
import {
  getPersistedPlayerLabel,
  isDealerLabel,
  normalizePlayerLabelKey,
  removePersistedPlayerLabel,
  setPersistedPlayerLabel,
} from "@/lib/player-labels";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

describe("persistent player labels (by nickname)", () => {
  it("normalizes keys case- and whitespace-insensitively", () => {
    expect(normalizePlayerLabelKey("  Иван Петрович ")).toBe("иван петрович");
    expect(normalizePlayerLabelKey(null)).toBe("");
  });

  it("sets and reads a label by nickname regardless of case/spacing", () => {
    const store = setPersistedPlayerLabel({}, "Иван Петрович", "дилер");
    expect(getPersistedPlayerLabel(store, "иван петрович")).toBe("дилер");
    expect(getPersistedPlayerLabel(store, " ИВАН ПЕТРОВИЧ ")).toBe("дилер");
    expect(getPersistedPlayerLabel(store, "Кто-то другой")).toBeNull();
  });

  it("removes a persisted label", () => {
    const store = setPersistedPlayerLabel({}, "Дилер Вася", "дилер");
    const next = removePersistedPlayerLabel(store, "дилер вася");
    expect(getPersistedPlayerLabel(next, "Дилер Вася")).toBeNull();
  });

  it("treats empty/missing stored values as no label", () => {
    expect(getPersistedPlayerLabel(undefined, "x")).toBeNull();
    expect(getPersistedPlayerLabel({ x: "  " }, "x")).toBeNull();
  });

  it("recognizes dealer labels case-insensitively and rejects everything else", () => {
    expect(isDealerLabel("дилер")).toBe(true);
    expect(isDealerLabel(" Dealer ")).toBe(true);
    expect(isDealerLabel("D")).toBe(true);
    expect(isDealerLabel("vip")).toBe(false);
    expect(isDealerLabel("")).toBe(false);
    expect(isDealerLabel(null)).toBe(false);
  });

  it("keeps playerLabels through merge and survives the roster-wipe finish patch", () => {
    const current = mergeTournamentExtras({
      players: [{ id: "p1", name: "Дилер", label: "дилер" }],
      playerLabels: { дилер: "дилер" },
    });
    expect(current.playerLabels).toEqual({ дилер: "дилер" });

    // Finish patch wipes the roster but must preserve persisted labels.
    const afterFinish = mergeTournamentExtras({ ...current, players: [] });
    expect(afterFinish.players).toEqual([]);
    expect(afterFinish.playerLabels).toEqual({ дилер: "дилер" });
  });
});
