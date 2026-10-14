import { describe, expect, it } from "vitest";
import {
  buildModeRules,
  resolveModeRulesKey,
  shouldShowModeRules,
  type ModeRules,
} from "@/lib/timer/mode-rules";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";
import type {
  BlindLevel,
  PublicTournamentState,
  TournamentExtras,
  TournamentPresetName,
} from "@/lib/timer/types";

function level(levelOrder: number, bigBlind: number, extra: Partial<BlindLevel> = {}): BlindLevel {
  return {
    ante: null,
    bigBlind,
    breakDurationSeconds: null,
    durationSeconds: 900,
    id: `level-${levelOrder}`,
    isBreak: false,
    levelOrder,
    reentryCloses: false,
    smallBlind: bigBlind / 2,
    ...extra,
  };
}

function pause(levelOrder: number): BlindLevel {
  return {
    ante: null,
    bigBlind: null,
    breakDurationSeconds: 600,
    durationSeconds: 600,
    id: `break-${levelOrder}`,
    isBreak: true,
    levelOrder,
    reentryCloses: false,
    smallBlind: null,
  };
}

// The club's structure: two breaks, re-entries shut on the first level after the second
// one, the x2 entry offered from the sixth level.
const CLUB_LEVELS: BlindLevel[] = [
  level(1, 10),
  level(2, 20),
  level(3, 30),
  level(4, 50),
  pause(5),
  level(6, 100, { doubleReentryAvailable: true }),
  level(7, 150, { doubleReentryAvailable: true }),
  level(8, 200, { doubleReentryAvailable: true }),
  level(9, 300, { doubleReentryAvailable: true }),
  level(10, 400, { doubleReentryAvailable: true }),
  pause(11),
  level(12, 600, { reentryCloses: true }),
];

const PHOENIX_POINTS = [600, 480, 390, 320, 260];

type Overrides = {
  blindLevels?: BlindLevel[];
  placePoints?: number[];
  settings?: Partial<TournamentExtras["settings"]>;
  startingStack?: number;
};

function stateFor(preset: TournamentPresetName | null, overrides: Overrides = {}): PublicTournamentState {
  return {
    blindLevels: overrides.blindLevels ?? CLUB_LEVELS,
    extras: {
      ...defaultTournamentExtras,
      pts: {
        ...defaultTournamentExtras.pts,
        bountyPoints: 30,
        placePoints: [...(overrides.placePoints ?? PHOENIX_POINTS), 0, 0, 0],
      },
      settings: {
        ...defaultTournamentExtras.settings,
        addonChips: 6000,
        addonEnabled: true,
        maxReentries: 3,
        reentryEnabled: true,
        tournamentPreset: preset,
        ...overrides.settings,
      },
    },
    timerState: {
      currentLevelIndex: 0,
      finishedAt: null,
      levelStartedAt: null,
      pausedRemainingSeconds: null,
      registrationClosesAt: null,
      status: "not_started",
    },
    tournament: {
      id: "tournament",
      logoUrl: null,
      name: "Majestic",
      publicToken: "token",
      registrationMinutes: 0,
      registrationStatus: "open",
      startingStack: overrides.startingStack ?? 2000,
    },
  };
}

function rulesFor(preset: TournamentPresetName | null, overrides?: Overrides): ModeRules {
  const rules = buildModeRules(stateFor(preset, overrides));
  if (!rules) throw new Error(`no rules for ${preset}`);
  return rules;
}

function stat(rules: ModeRules, label: string) {
  const found = rules.stats.find((item) => item.label === label);
  if (!found) throw new Error(`no ${label} stat`);
  return found;
}

describe("shouldShowModeRules", () => {
  it("shows the rules once the first player is seated before the start", () => {
    expect(shouldShowModeRules("not_started", 1)).toBe(true);
  });

  it("keeps the usual board while nobody is seated yet", () => {
    expect(shouldShowModeRules("not_started", 0)).toBe(false);
  });

  it.each(["running", "paused", "break", "finished"] as const)(
    "hands the board back to the clock once it is %s",
    (status) => {
      expect(shouldShowModeRules(status, 12)).toBe(false);
    },
  );
});

describe("resolveModeRulesKey", () => {
  it.each(["phoenix", "deepstack", "bounty", "progressive", "mystery", "freeroll", "lastchance"] as const)(
    "gives the %s tournament its own slide",
    (preset) => {
      expect(resolveModeRulesKey({ ...defaultTournamentExtras.settings, tournamentPreset: preset })).toBe(preset);
    },
  );

  it.each(["dealer", "wanted"] as const)("has no slide for a bounty game switched to %s", (bountyType) => {
    expect(
      resolveModeRulesKey({
        ...defaultTournamentExtras.settings,
        bountyType,
        isBounty: true,
        tournamentPreset: "bounty",
      }),
    ).toBeNull();
  });

  it("has no slide for a regular game set up by hand", () => {
    expect(resolveModeRulesKey(defaultTournamentExtras.settings)).toBeNull();
  });

  it("recognises a hand-made freeroll by its format", () => {
    expect(resolveModeRulesKey({ ...defaultTournamentExtras.settings, tournamentFormat: "freeroll" })).toBe(
      "freeroll",
    );
  });
});

describe("buildModeRules", () => {
  it("returns nothing for a game without a slide", () => {
    expect(buildModeRules(stateFor(null))).toBeNull();
  });

  it("counts the starting stack in big blinds of the first level", () => {
    const stack = stat(rulesFor("bounty"), "Стартовый стек");

    expect(stack.value).toBe((2000).toLocaleString("ru-RU"));
    expect(stack.note).toBe("фишек · 200 BB");
  });

  it("names the break that closes re-entries and the last level before it", () => {
    const reentries = stat(rulesFor("bounty"), "Ре-энтри");

    expect(reentries.value).toBe("до 3");
    expect(reentries.note).toBe("одинарные или двойные, до второй паузы (9-й уровень)");
  });

  it("prices the addon in big blinds at the break where it is bought", () => {
    const addon = stat(rulesFor("bounty"), "Аддон");

    expect(addon.value).toBe((6000).toLocaleString("ru-RU"));
    expect(addon.note).toBe("фишек · 15 BB, на второй паузе");
    expect(addon.accent).toBe(true);
  });

  it("gives PHOENIX its exact count of single re-entries and no addon", () => {
    const rules = rulesFor("phoenix", {
      settings: { addonEnabled: false, maxReentries: 1, tournamentFormat: "phoenix" },
    });

    expect(stat(rules, "Ре-энтри")).toMatchObject({
      note: "одинарный, до второй паузы (9-й уровень)",
      value: "1",
    });
    expect(stat(rules, "Аддон")).toMatchObject({ accent: true, note: "без аддонов", value: "Нет" });
    expect(rules.description).toBe(
      "Чистая турнирная игра — один одинарный ре-энтри, без двойных ре-энтри и аддонов.",
    );
  });

  it("writes the DEEP STACK line from its stack and re-entry count", () => {
    const rules = rulesFor("deepstack", {
      settings: { addonEnabled: false, maxReentries: 3, tournamentFormat: "deepstack" },
      startingStack: 4000,
    });

    expect(stat(rules, "Ре-энтри")).toMatchObject({ value: "3" });
    expect(stat(rules, "Ре-энтри").note).toMatch(/^одинарных,/);
    expect(stat(rules, "Стартовый стек").note).toBe("фишек · 400 BB");
    expect(rules.description).toBe(
      `Глубокий стартовый стек — ${(4000).toLocaleString("ru-RU")} фишек. До трёх одинарных ре-энтри, без двойных ре-энтри и аддонов.`,
    );
  });

  it("shows unlimited re-entries in Progressive Bounty", () => {
    const rules = rulesFor("progressive", { settings: { bountyType: "progressive", isBounty: true } });

    expect(stat(rules, "Ре-энтри").value).toBe("∞");
  });

  it("says there are no re-entries when the admin switched them off", () => {
    const rules = rulesFor("bounty", { settings: { reentryEnabled: false } });

    expect(stat(rules, "Ре-энтри")).toMatchObject({ accent: true, value: "Нет" });
  });

  it("leaves the window out when no level closes re-entries", () => {
    const rules = rulesFor("bounty", {
      blindLevels: CLUB_LEVELS.map((item) => ({ ...item, reentryCloses: false })),
    });

    expect(stat(rules, "Ре-энтри").note).toBe("одинарные или двойные");
    expect(stat(rules, "Аддон").note).toBe("фишек");
  });

  it("puts the knockout points from the settings on the Bounty slide", () => {
    expect(rulesFor("bounty").feature).toEqual({ bigBlinds: 2, kind: "bounty", points: 30 });
  });

  it("builds the Progressive ladder from the head price", () => {
    const feature = rulesFor("progressive").feature;
    if (feature?.kind !== "progressive") throw new Error("no ladder");

    expect(feature.ladder.map((step) => step.points)).toEqual([30, 50, 70, 90, 110]);
    expect(feature.ladder.map((step) => step.label)).toEqual(["старт", "1 KO", "2 KO", "3 KO", "4 KO"]);
  });

  it("lists the scoring places and drops the zeros after them", () => {
    expect(rulesFor("phoenix").placePoints).toEqual(
      PHOENIX_POINTS.map((points, index) => ({ place: index + 1, points })),
    );
  });

  it("has no points column when the tournament gives no points", () => {
    expect(rulesFor("phoenix", { placePoints: [] }).placePoints).toEqual([]);
  });

  it("colours Mystery violet and Last Chance gold", () => {
    expect(rulesFor("mystery").accent).toBe("violet");
    expect(rulesFor("lastchance").accent).toBe("gold");
    expect(rulesFor("lastchance").placePointsNote).toBe("Бонус +30% уже учтён");
  });

  it("points every slide at its own art", () => {
    expect(rulesFor("freeroll").artSrc).toBe("/modes/freeroll.webp");
  });
});
