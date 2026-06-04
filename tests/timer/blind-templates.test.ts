import { describe, expect, it } from "vitest";
import {
  makeBlindTemplate,
  upsertBlindTemplate,
} from "@/lib/timer/blind-templates";
import type { BlindLevel } from "@/lib/timer/types";

const levels: BlindLevel[] = [
  {
    id: "level-1",
    levelOrder: 1,
    smallBlind: 25,
    bigBlind: 50,
    ante: 0,
    reentryCloses: true,
    durationSeconds: 900,
    isBreak: false,
    breakDurationSeconds: null,
  },
];

describe("makeBlindTemplate", () => {
  it("trims names and stores levels without editor ids", () => {
    expect(makeBlindTemplate("  Home Game  ", levels, "template-1")).toEqual({
      id: "template-1",
      name: "Home Game",
      levels: [
        {
          levelOrder: 1,
          smallBlind: 25,
          bigBlind: 50,
          ante: 0,
          reentryCloses: true,
          durationSeconds: 900,
          isBreak: false,
          breakDurationSeconds: null,
        },
      ],
    });
  });
});

describe("upsertBlindTemplate", () => {
  it("replaces a template with the same name and keeps the newest first", () => {
    const previous = makeBlindTemplate("Home Game", levels, "old");
    const next = makeBlindTemplate(
      "home game",
      [{ ...levels[0], durationSeconds: 1500 }],
      "new",
    );

    expect(upsertBlindTemplate([previous], next)).toEqual([next]);
  });
});
