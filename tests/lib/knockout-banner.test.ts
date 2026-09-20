import { describe, expect, it } from "vitest";
import {
  buildKnockoutBanner,
  describeKnockoutOutcome,
  isKnockoutBanner,
  selectKnockoutsToPlay,
  KNOCKOUT_BANNER_FRESH_MS,
  type KnockoutBanner,
} from "@/lib/knockouts/banner";

const NOW = new Date("2026-09-20T20:00:00.000Z");

function banner(overrides: Partial<KnockoutBanner> = {}): KnockoutBanner {
  return {
    id: "k1",
    killers: [],
    place: 9,
    player: { avatarUrl: null, name: "Чура" },
    recordedAt: NOW.toISOString(),
    reentry: null,
    ...overrides,
  };
}

describe("buildKnockoutBanner", () => {
  it("records the place a player finished in", () => {
    const built = buildKnockoutBanner({ id: "k1", place: 9, playerName: "Чура" });

    expect(built).toMatchObject({ place: 9, reentry: null });
    expect(built.player.name).toBe("Чура");
  });

  // A player who bought back in took no place: the two answers are the same question.
  it("records a re-entry instead of a place", () => {
    const built = buildKnockoutBanner({ place: 9, playerName: "Чура", usesReentry: true });

    expect(built.place).toBeNull();
    expect(built.reentry).toEqual({ double: false });
  });

  it("tells a double re-entry from a single one", () => {
    const built = buildKnockoutBanner({
      playerName: "Чура",
      reentryDouble: true,
      usesReentry: true,
    });

    expect(built.reentry).toEqual({ double: true });
  });

  it("carries the killers and the faces the club has", () => {
    const built = buildKnockoutBanner({
      findAvatar: (player) =>
        player.name === "Киллер" ? "https://example.test/killer.jpg" : null,
      killers: [{ name: "Киллер", telegramId: 100 }],
      place: 5,
      playerName: "Жертва",
    });

    expect(built.killers).toEqual([
      { avatarUrl: "https://example.test/killer.jpg", name: "Киллер" },
    ]);
    expect(built.player.avatarUrl).toBeNull();
  });

  // "ВЫБИЛ ИГРОК" would tell the room nothing at all.
  it("drops a killer the club could not name", () => {
    const built = buildKnockoutBanner({
      killers: [{ name: "  " }, { name: "Настоящий" }],
      playerName: "Жертва",
    });

    expect(built.killers.map((killer) => killer.name)).toEqual(["Настоящий"]);
  });

  it("names a player the roster left blank rather than showing an empty banner", () => {
    expect(buildKnockoutBanner({ playerName: "" }).player.name).toBe("Игрок");
  });
});

describe("describeKnockoutOutcome", () => {
  it("says the place for a player who is out for good", () => {
    expect(describeKnockoutOutcome(banner())).toBe("9 место");
  });

  it("says what kind of re-entry the player is taking", () => {
    expect(describeKnockoutOutcome(banner({ place: null, reentry: { double: false } }))).toBe(
      "использует ре-энтри",
    );
    expect(describeKnockoutOutcome(banner({ place: null, reentry: { double: true } }))).toBe(
      "использует ре-энтри x2",
    );
  });

  it("still says something when the place was never recorded", () => {
    expect(describeKnockoutOutcome(banner({ place: null }))).toBe("выбывает");
  });
});

describe("selectKnockoutsToPlay", () => {
  // On the final table two players go out on one hand; the room should hear both names.
  it("plays every banner the screen has not played yet, oldest first", () => {
    const first = banner({ id: "k1", recordedAt: "2026-09-20T19:59:58.000Z" });
    const second = banner({ id: "k2", recordedAt: "2026-09-20T19:59:59.000Z" });

    const toPlay = selectKnockoutsToPlay([second, first], new Set(), NOW);

    expect(toPlay.map((item) => item.id)).toEqual(["k1", "k2"]);
  });

  it("never plays the same knockout twice", () => {
    const toPlay = selectKnockoutsToPlay([banner({ id: "k1" })], new Set(["k1"]), NOW);

    expect(toPlay).toEqual([]);
  });

  // A screen that reloads reads the last few knockouts the club wrote down; replaying
  // them would announce a player who went out half an hour ago.
  it("leaves a stale banner alone", () => {
    const stale = banner({
      id: "old",
      recordedAt: new Date(NOW.getTime() - KNOCKOUT_BANNER_FRESH_MS - 1).toISOString(),
    });

    expect(selectKnockoutsToPlay([stale], new Set(), NOW)).toEqual([]);
  });

  it("ignores a banner whose timestamp is unreadable", () => {
    expect(selectKnockoutsToPlay([banner({ recordedAt: "не дата" })], new Set(), NOW)).toEqual([]);
  });
});

describe("isKnockoutBanner", () => {
  it("accepts a banner as it comes back out of stored JSON", () => {
    expect(isKnockoutBanner(JSON.parse(JSON.stringify(banner())))).toBe(true);
  });

  it.each([null, "нет", {}, { id: "k1" }, { id: "k1", recordedAt: "now", player: null }])(
    "rejects %s",
    (value) => {
      expect(isKnockoutBanner(value)).toBe(false);
    },
  );
});
