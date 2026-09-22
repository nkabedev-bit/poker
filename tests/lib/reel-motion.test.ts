import { describe, expect, it } from "vitest";
import { RAFFLE_WIN_NOTICE_DELAY_MS } from "@/lib/raffle/raffle";
import {
  buildReelKeyframes,
  CLASSIC_MOTION,
  MAX_REEL_SPIN_SECONDS,
  pickReelMotion,
  readReelMotion,
  REEL_STYLES,
  type ReelKeyframe,
  type ReelMotion,
  type ReelStyle,
} from "@/lib/raffle/reel-motion";

/** A repeatable stand-in for the server's randomness (mulberry32). */
function seeded(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where each keyframe puts the reel, in pixels. */
function positions(keyframes: ReelKeyframe[]) {
  return keyframes.map((frame) => {
    const match = /translate3d\((-?[\d.]+)px/.exec(frame.transform);
    if (!match) throw new Error(`Не разобрать кадр: ${frame.transform}`);
    return Number(match[1]);
  });
}

/** Keyframes where the reel stands still: the stops the room sees. */
function rests(keyframes: ReelKeyframe[]) {
  const at = positions(keyframes);
  return at.filter((x, index) => index > 0 && at[index - 1] === x);
}

const PITCH = 268;
/** Forty-one cards of travel, the way the television runs a classic draw. */
const TO = -41 * PITCH;

const STOPS: Record<ReelStyle, number> = {
  classic: 0,
  clicks: 3,
  nearMiss: 1,
  secondWind: 7,
  windup: 0,
};

function motion(style: ReelStyle, overrides: Partial<ReelMotion> = {}): ReelMotion {
  return { ...CLASSIC_MOTION, firstStopCells: STOPS[style], style, ...overrides };
}

describe("pickReelMotion", () => {
  const draws = (count: number, previous?: ReelStyle) => {
    const random = seeded(7);
    return Array.from({ length: count }, () => pickReelMotion(random, previous));
  };

  it("runs each of the five ways", () => {
    expect(new Set(draws(200).map(({ motion: picked }) => picked.style))).toEqual(
      new Set(REEL_STYLES),
    );
  });

  // Two draws an evening: the VIP one never runs the way the regular one just did.
  it("never runs the evening's second draw the way the first one ran", () => {
    for (const previous of REEL_STYLES) {
      const styles = draws(100, previous).map(({ motion: picked }) => picked.style);

      expect(styles).not.toContain(previous);
      expect(new Set(styles).size).toBe(REEL_STYLES.length - 1);
    }
  });

  it("keeps every run inside what the screen can trust", () => {
    const picked = draws(500);

    for (const { motion: run, spinSeconds } of picked) {
      expect(Number.isInteger(run.travelCells)).toBe(true);
      expect(run.travelCells).toBeGreaterThanOrEqual(38);
      expect(run.travelCells).toBeLessThanOrEqual(52);
      expect(Math.abs(run.landingShift)).toBeLessThanOrEqual(0.28);
      expect(spinSeconds).toBeGreaterThanOrEqual(9.5);
      expect(spinSeconds).toBeLessThanOrEqual(MAX_REEL_SPIN_SECONDS);
    }

    expect(new Set(picked.map(({ motion: run }) => run.direction))).toEqual(
      new Set(["left", "right"]),
    );
  });

  it("stops each run where its script says", () => {
    for (const { motion: run } of draws(300)) {
      if (run.style === "nearMiss") expect(run.firstStopCells).toBe(1);
      if (run.style === "clicks") expect([3, 4]).toContain(run.firstStopCells);
      if (run.style === "secondWind") {
        expect(run.firstStopCells).toBeGreaterThanOrEqual(6);
        expect(run.firstStopCells).toBeLessThanOrEqual(9);
      }
      if (run.style === "classic" || run.style === "windup") expect(run.firstStopCells).toBe(0);
    }
  });

  // A screen whose live connection is down picks the draw up on its 45-second poll and
  // waits up to a second and a half for the faces; the winner's phone must not beat it.
  it("lets the room see the winner before the bot tells them", () => {
    expect(45_000 + 1_500 + MAX_REEL_SPIN_SECONDS * 1000).toBeLessThan(RAFFLE_WIN_NOTICE_DELAY_MS);
  });

  it("writes down only what the screen will read back", () => {
    for (const { motion: run } of draws(300)) {
      expect(readReelMotion(run)).toEqual(run);
    }
  });
});

describe("readReelMotion", () => {
  // Draws taken before there were five carry no motion at all.
  it("runs an older draw the way the reel always ran", () => {
    expect(readReelMotion(undefined)).toEqual(CLASSIC_MOTION);
    expect(readReelMotion(null)).toEqual(CLASSIC_MOTION);
    expect(readReelMotion("clicks")).toEqual(CLASSIC_MOTION);
  });

  it("falls back to the classic run rather than trust a motion it cannot read", () => {
    expect(readReelMotion({ ...motion("clicks"), style: "spiral" })).toEqual(CLASSIC_MOTION);
    expect(readReelMotion({ ...motion("clicks"), firstStopCells: 0 })).toEqual(CLASSIC_MOTION);
    expect(readReelMotion({ ...motion("windup"), landingShift: 0.5 })).toEqual(CLASSIC_MOTION);
    expect(readReelMotion({ ...motion("windup"), travelCells: 400 })).toEqual(CLASSIC_MOTION);
    expect(readReelMotion({ ...motion("windup"), direction: "up" })).toEqual(CLASSIC_MOTION);
  });
});

describe("buildReelKeyframes", () => {
  // The room has watched this run for weeks; it stays exactly as it was.
  it("keeps the classic run the room has always seen", () => {
    const keyframes = buildReelKeyframes(CLASSIC_MOTION, { pitch: PITCH, seconds: 10, to: TO });

    expect(keyframes).toHaveLength(2);
    expect(keyframes[0].easing).toBe("cubic-bezier(0.12, 0.72, 0.06, 1)");
    expect(positions(keyframes)).toEqual([0, TO]);
  });

  describe.each(REEL_STYLES)("the %s run", (style) => {
    it.each([
      ["left", TO],
      ["right", -TO],
    ])("lands on the winner running %s", (_direction, to) => {
      const keyframes = buildReelKeyframes(motion(style), { pitch: PITCH, seconds: 12, to });
      const at = positions(keyframes);

      expect(at[0]).toBe(0);
      expect(at[at.length - 1]).toBeCloseTo(to, 0);
      expect(keyframes[0].offset).toBe(0);
      expect(keyframes[keyframes.length - 1].offset).toBe(1);

      for (let index = 1; index < keyframes.length; index += 1) {
        expect(keyframes[index].offset).toBeGreaterThan(keyframes[index - 1].offset);
        // Never backwards, never past the winner: nothing the room could read as a fix.
        expect(Math.abs(at[index])).toBeGreaterThanOrEqual(Math.abs(at[index - 1]));
        expect(Math.abs(at[index])).toBeLessThanOrEqual(Math.abs(to));
      }
    });
  });

  it("comes to rest on the neighbour before crawling onto the winner", () => {
    const at = positions(buildReelKeyframes(motion("nearMiss"), { pitch: PITCH, seconds: 11.5, to: TO }));

    expect(at).toContain(TO + PITCH);
  });

  it("clicks over the last cards one at a time, stopping on each", () => {
    const keyframes = buildReelKeyframes(motion("clicks"), { pitch: PITCH, seconds: 12, to: TO });

    expect(rests(keyframes)).toEqual([TO + 3 * PITCH, TO + 2 * PITCH, TO + PITCH]);
  });

  it("clicks over four cards when the draw says four", () => {
    const keyframes = buildReelKeyframes(motion("clicks", { firstStopCells: 4 }), {
      pitch: PITCH,
      seconds: 12,
      to: TO,
    });

    expect(rests(keyframes)).toHaveLength(4);
  });

  it("stalls well short of the winner, then goes on to them", () => {
    const keyframes = buildReelKeyframes(motion("secondWind"), { pitch: PITCH, seconds: 12, to: TO });

    expect(rests(keyframes)).toEqual([TO + 7 * PITCH]);
    expect(positions(keyframes).at(-1)).toBe(TO);
  });

  // A screen so wide the run is shorter than the stall: the reel waits where it stands.
  it("never runs backwards when the run is too short for its stops", () => {
    const at = positions(
      buildReelKeyframes(motion("secondWind"), { pitch: PITCH, seconds: 12, to: -2 * PITCH }),
    );

    for (let index = 1; index < at.length; index += 1) {
      expect(Math.abs(at[index])).toBeGreaterThanOrEqual(Math.abs(at[index - 1]));
    }
    expect(at.at(-1)).toBe(-2 * PITCH);
  });

  // An odd stored duration still leaves the reel its fast part.
  it("squeezes the clicks into a short spin rather than the other way round", () => {
    const keyframes = buildReelKeyframes(motion("clicks"), { pitch: PITCH, seconds: 3, to: TO });

    expect(keyframes[1].offset).toBeGreaterThanOrEqual(0.39);
    expect(keyframes.at(-1)?.offset).toBe(1);
  });
});
