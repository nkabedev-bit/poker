import { describe, expect, it } from "vitest";
import { RAFFLE_WIN_NOTICE_DELAY_MS } from "@/lib/raffle/raffle";
import { CLASSIC_MOTION, MAX_REEL_SPIN_SECONDS } from "@/lib/raffle/reel-motion";
import {
  countWord,
  faceGridShape,
  pickRaffleMotion,
  planFinalTable,
  RAFFLE_STYLES,
  readRaffleMotion,
  SPOTLIGHT_HOPS,
  type RaffleStyle,
} from "@/lib/raffle/raffle-scenes";

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

const ROOM = Array.from({ length: 40 }, (_, index) => index + 1);
const WINNER = 27;

function room(size: number, winnerNumber = 1) {
  return { numbers: Array.from({ length: size }, (_, index) => index + 1), winnerNumber };
}

function picks(count: number, previous: RaffleStyle | null = null, draw = { numbers: ROOM, winnerNumber: WINNER }) {
  const random = seeded(11);
  return Array.from({ length: count }, () => pickRaffleMotion(random, previous, draw));
}

describe("pickRaffleMotion", () => {
  it("runs every one of the eight ways", () => {
    expect(RAFFLE_STYLES).toHaveLength(8);
    expect(new Set(picks(400).map(({ motion }) => motion.style))).toEqual(new Set(RAFFLE_STYLES));
  });

  // Two draws an evening: the VIP one never runs the way the regular one just did.
  it("never runs the evening's second draw the way the first one ran", () => {
    for (const previous of RAFFLE_STYLES) {
      const styles = picks(200, previous).map(({ motion }) => motion.style);

      expect(styles).not.toContain(previous);
      expect(new Set(styles).size).toBe(RAFFLE_STYLES.length - 1);
    }
  });

  // The winner's bot message waits a minute, and a screen off its live connection may
  // only pick the draw up 45 seconds in.
  it("keeps every run short of the winner's message, whatever the size of the room", () => {
    for (const size of [1, 2, 5, 12, 25, 40, 60]) {
      for (const { spinSeconds } of picks(200, null, room(size))) {
        expect(spinSeconds).toBeLessThanOrEqual(MAX_REEL_SPIN_SECONDS);
      }
    }

    expect(45_000 + 1_500 + MAX_REEL_SPIN_SECONDS * 1000).toBeLessThan(RAFFLE_WIN_NOTICE_DELAY_MS);
  });

  it("knocks out everyone but the winner, each of them once", () => {
    const tables = picks(300).flatMap(({ motion }) => (motion.style === "finalTable" ? [motion] : []));

    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      expect([...table.order].sort((a, b) => a - b)).toEqual(ROOM.filter((n) => n !== WINNER));
    }
  });

  it("rests the light on the winner, and never lights one face twice running", () => {
    const runs = picks(300).flatMap(({ motion }) => (motion.style === "spotlight" ? [motion] : []));

    expect(runs.length).toBeGreaterThan(0);
    for (const { hops } of runs) {
      expect(hops).toHaveLength(SPOTLIGHT_HOPS);
      expect(hops.at(-1)).toBe(WINNER);
      // The light does not circle back to the winner just before it lands there.
      expect(hops.slice(-3, -1)).not.toContain(WINNER);
      hops.forEach((hop, index) => {
        if (index > 0) expect(hop).not.toBe(hops[index - 1]);
        if (index > 1) expect(hop).not.toBe(hops[index - 2]);
      });
    }
  });

  it("still lands on the winner in a room of one or two", () => {
    for (const size of [1, 2]) {
      for (const { motion } of picks(200, null, room(size, size))) {
        if (motion.style === "spotlight") expect(motion.hops.at(-1)).toBe(size);
        if (motion.style === "finalTable") expect(motion.order).toEqual(size === 2 ? [1] : []);
      }
    }
  });

  it("starts the drums on any digit", () => {
    const digits = picks(300).flatMap(({ motion }) =>
      motion.style === "slotMachine" ? motion.from : [],
    );

    expect(new Set(digits)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it("writes down only what the screen reads back", () => {
    for (const { motion } of picks(300)) {
      expect(readRaffleMotion(motion, { numbers: ROOM, winnerNumber: WINNER })).toEqual(motion);
    }
  });
});

describe("planFinalTable", () => {
  it("knocks a full evening down in waves, then one at a time", () => {
    expect(planFinalTable(40).waves.map((wave) => wave.remaining)).toEqual([22, 12, 6, 5, 4, 3, 2, 1]);
  });

  it("waits longest on the heads-up", () => {
    const { waves } = planFinalTable(40);
    const gaps = waves.slice(1).map((wave, index) => wave.atMs - waves[index].atMs);

    expect(gaps.at(-1)).toBe(Math.max(...gaps));
  });

  it("names the only player at once", () => {
    expect(planFinalTable(1)).toEqual({ totalMs: 700, waves: [] });
  });

  it("fits any room the club could hold inside the winner's minute", () => {
    for (let size = 1; size <= 60; size += 1) {
      expect(planFinalTable(size).totalMs).toBeLessThanOrEqual(MAX_REEL_SPIN_SECONDS * 1000);
    }
  });
});

describe("readRaffleMotion", () => {
  const draw = { numbers: [1, 2, 3, 27], winnerNumber: WINNER };

  // An older draw, and a screen that meets a scene it has never heard of.
  it("reads anything that is not a scene as the reel", () => {
    expect(readRaffleMotion(undefined, draw)).toEqual(CLASSIC_MOTION);
    expect(readRaffleMotion({ style: "roulette" }, draw)).toEqual(CLASSIC_MOTION);
  });

  it("mends a final table that names strangers, the winner or nobody at all", () => {
    expect(readRaffleMotion({ order: [3, 99, 3, WINNER, 1], style: "finalTable" }, draw)).toEqual({
      order: [3, 1, 2],
      style: "finalTable",
    });
    expect(readRaffleMotion({ style: "finalTable" }, draw)).toEqual({
      order: [1, 2, 3],
      style: "finalTable",
    });
  });

  it("always rests the light on the winner", () => {
    expect(readRaffleMotion({ hops: [1, 2, 99], style: "spotlight" }, draw)).toEqual({
      hops: [1, 2, WINNER],
      style: "spotlight",
    });
  });

  it("starts a drum it cannot read at zero", () => {
    expect(readRaffleMotion({ from: [12, "x"], style: "slotMachine" }, draw)).toEqual({
      from: [0, 0],
      style: "slotMachine",
    });
  });
});

describe("faceGridShape", () => {
  it("lays the room out in cards a little wider than tall", () => {
    expect(faceGridShape(40)).toEqual({ cols: 10, rows: 4 });
    expect(faceGridShape(12)).toEqual({ cols: 6, rows: 2 });
    expect(faceGridShape(1)).toEqual({ cols: 1, rows: 1 });
  });

  it("never leaves a row empty", () => {
    for (let count = 1; count <= 60; count += 1) {
      const { cols, rows } = faceGridShape(count);

      expect(cols * rows).toBeGreaterThanOrEqual(count);
      expect(cols * (rows - 1)).toBeLessThan(count);
    }
  });
});

describe("countWord", () => {
  it("agrees the word with the number", () => {
    const players: [string, string, string] = ["игрок", "игрока", "игроков"];

    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((count) => countWord(count, players))).toEqual([
      "1 игрок",
      "2 игрока",
      "5 игроков",
      "11 игроков",
      "12 игроков",
      "21 игрок",
      "22 игрока",
      "25 игроков",
      "111 игроков",
    ]);
  });
});
