import { describe, expect, it } from "vitest";
import { getReentryInfoRows } from "@/components/public/public-screen";

describe("getReentryInfoRows", () => {
  it("shows single re-entry, x2 entry and the 15BB addon in the regular format without bounty", () => {
    const rows = getReentryInfoRows("regular", false);

    expect(rows.map((row) => row.label)).toEqual([
      "Повторный вход",
      "Вход ×2 стек",
      "Аддон 15BB",
    ]);
  });

  it("describes the addon as triple starting stack in bounty modes", () => {
    const rows = getReentryInfoRows("regular", true);

    expect(rows.map((row) => row.label)).toEqual([
      "Повторный вход",
      "Вход ×2 стек",
      "Аддон ×3 стартового стека",
    ]);
    expect(rows[2].note).toBe("пауза 9–10 ур.");
  });

  it("keeps only the single re-entry row in the PHOENIX format", () => {
    const rows = getReentryInfoRows("phoenix", false);

    expect(rows.map((row) => row.label)).toEqual(["Повторный вход"]);
  });

  it("keeps only the single re-entry row in the DEEP STACK format even with bounty on", () => {
    const rows = getReentryInfoRows("deepstack", true);

    expect(rows.map((row) => row.label)).toEqual(["Повторный вход"]);
  });

  it("falls back to the regular rows when the format is missing in old tournaments", () => {
    const rows = getReentryInfoRows(undefined, false);

    expect(rows).toHaveLength(3);
  });
});
