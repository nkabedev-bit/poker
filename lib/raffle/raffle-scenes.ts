/**
 * The draws that are not a reel.
 *
 * Five ways for the reel to travel were still one picture — a strip of faces running
 * past a needle — and the room learned it. Three scenes stand beside it: the final
 * table, where the room is knocked out wave by wave until one player is left; the
 * one-armed bandit, whose drums stop on the tens and then the units of the winning
 * number; and the spotlight, which hops from face to face in a darkened room.
 *
 * Like the reel, every scene lands on a winner the server has already drawn, and what
 * the scene does on the way is drawn with it and stored with the draw — who goes out in
 * which wave, which digits the drums start from, which faces the light hops over — so
 * every screen in the hall plays the same evening. Kept free of imports beyond the reel:
 * plain arithmetic, shared by the server that picks and the screen that plays.
 */
import {
  buildReelMotion,
  readReelMotion,
  REEL_STYLES,
  type ReelMotion,
  type ReelStyle,
} from "@/lib/raffle/reel-motion";

export type SceneStyle = "finalTable" | "slotMachine" | "spotlight";

export type RaffleStyle = ReelStyle | SceneStyle;

export type FinalTableMotion = {
  /** Everyone but the winner, in the order they are knocked out. */
  order: number[];
  style: "finalTable";
};

export type SlotMachineMotion = {
  /** The digits the two drums show before the lever is pulled: tens, then units. */
  from: [number, number];
  style: "slotMachine";
};

export type SpotlightMotion = {
  /** The faces the light lands on, hop by hop. The last one is the winner. */
  hops: number[];
  style: "spotlight";
};

export type SceneMotion = FinalTableMotion | SlotMachineMotion | SpotlightMotion;

export type RaffleMotion = ReelMotion | SceneMotion;

export const SCENE_STYLES: readonly SceneStyle[] = ["finalTable", "slotMachine", "spotlight"];

/** Every way a draw can run, each as likely as the others. */
export const RAFFLE_STYLES: readonly RaffleStyle[] = [...REEL_STYLES, ...SCENE_STYLES];

/** Who stood in the draw and who won it — all a scene needs to be read back. */
export type SceneDraw = { numbers: number[]; winnerNumber: number };

/**
 * The final table's clock, in milliseconds.
 *
 * The field goes in waves of roughly half until five are left, then one at a time, and
 * each of the last gaps is longer than the one before: the room waits longest on the
 * heads-up.
 */
export const FINAL_TABLE_TIMING = {
  firstWaveMs: 900,
  lastGapsMs: [1100, 1300, 1500, 1900],
  settleMs: 700,
  waveGapMs: 1000,
} as const;

/** How many are left before the knockouts go one at a time. */
const FINAL_TABLE_LAST_FEW = 5;

/**
 * The one-armed bandit's clock, in milliseconds: the lever, the tens drum stopping,
 * the units drum stopping long after it, and the moment before the name is read out.
 */
export const SLOT_MACHINE_TIMING = {
  leverMs: 350,
  settleMs: 500,
  tensMs: 4600,
  unitsMs: 10200,
} as const;

/**
 * The spotlight's clock, in milliseconds. The hops start quick and each one lasts a
 * little longer than the one before, until the last few take close to a second.
 */
export const SPOTLIGHT_TIMING = {
  darkenMs: 700,
  firstHopMs: 80,
  holdMs: 500,
  hopGrowth: 1.115,
  hopsMs: 8800,
  lightsMs: 700,
} as const;

/** How long each hop of the light lasts, for a run of `count` hops. */
export function spotlightHopDurations(count: number) {
  return Array.from(
    { length: Math.max(0, count) },
    (_, hop) => SPOTLIGHT_TIMING.firstHopMs * SPOTLIGHT_TIMING.hopGrowth ** hop,
  );
}

/** As many hops as fit in the light's run: the length every stored run has. */
export const SPOTLIGHT_HOPS = (() => {
  let count = 0;
  let elapsed = 0;

  while (elapsed < SPOTLIGHT_TIMING.hopsMs) {
    elapsed += SPOTLIGHT_TIMING.firstHopMs * SPOTLIGHT_TIMING.hopGrowth ** count;
    count += 1;
  }

  return count;
})();

/**
 * The final table wave by wave: when each wave goes out and how many are still in
 * after it, and when the winner is named.
 */
export function planFinalTable(entrants: number) {
  const { firstWaveMs, lastGapsMs, settleMs, waveGapMs } = FINAL_TABLE_TIMING;
  const counts: number[] = [];
  let left = entrants;

  while (left > FINAL_TABLE_LAST_FEW) {
    left = Math.max(FINAL_TABLE_LAST_FEW, Math.floor(left * 0.55));
    counts.push(left);
  }
  while (left > 1) {
    left -= 1;
    counts.push(left);
  }

  const waves: Array<{ atMs: number; remaining: number }> = [];
  let at = firstWaveMs;

  counts.forEach((remaining, index) => {
    waves.push({ atMs: at, remaining });
    const wavesAfter = counts.length - index - 1;
    at +=
      remaining <= FINAL_TABLE_LAST_FEW
        ? lastGapsMs[Math.max(0, lastGapsMs.length - wavesAfter)]
        : waveGapMs;
  });

  return { totalMs: (waves.at(-1)?.atMs ?? 0) + settleMs, waves };
}

/** When the one-armed bandit names the winner. */
export function slotMachineTotalMs() {
  const { leverMs, settleMs, unitsMs } = SLOT_MACHINE_TIMING;
  return leverMs + unitsMs + settleMs;
}

/** When the spotlight names the winner, for a run of `hops` hops. */
export function spotlightTotalMs(hops: number) {
  const { darkenMs, holdMs, lightsMs } = SPOTLIGHT_TIMING;
  const hopping = spotlightHopDurations(hops).reduce((total, hop) => total + hop, 0);
  return darkenMs + hopping + holdMs + lightsMs;
}

const toSeconds = (ms: number) => Math.round(ms / 100) / 10;

function pickIndex(random: () => number, length: number) {
  return Math.min(length - 1, Math.floor(random() * length));
}

function shuffled(numbers: number[], random: () => number) {
  const list = [...numbers];

  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = pickIndex(random, index + 1);
    [list[index], list[swap]] = [list[swap], list[index]];
  }

  return list;
}

/**
 * Where the light goes: anywhere but the last two faces it lit, the winner last — and
 * never on the winner in the two hops before, so the last hop is one the room sees
 * happen rather than a light that circles back.
 */
function pickSpotlightHops(random: () => number, { numbers, winnerNumber }: SceneDraw) {
  const hops: number[] = [];

  for (let hop = 0; hop < SPOTLIGHT_HOPS - 1; hop += 1) {
    const recent = hops.slice(-2);
    const nearTheEnd = hop >= SPOTLIGHT_HOPS - 3;
    let choices = numbers.filter(
      (number) => !recent.includes(number) && !(nearTheEnd && number === winnerNumber),
    );
    // A room of one or two cannot keep to that; it only avoids lighting the same face twice.
    if (choices.length === 0) choices = numbers.filter((number) => number !== hops.at(-1));
    if (choices.length === 0) choices = [winnerNumber];

    hops.push(choices[pickIndex(random, choices.length)]);
  }

  hops.push(winnerNumber);
  return hops;
}

/**
 * How tonight's draw runs, and for how long.
 *
 * Any of the eight, as likely as each other — except the one the evening's other draw
 * just ran.
 */
export function pickRaffleMotion(
  random: () => number,
  previous: string | null | undefined,
  draw: SceneDraw,
): { motion: RaffleMotion; spinSeconds: number } {
  const styles = RAFFLE_STYLES.filter((style) => style !== previous);
  const style = styles[pickIndex(random, styles.length)];

  switch (style) {
    case "finalTable":
      return {
        motion: {
          order: shuffled(
            draw.numbers.filter((number) => number !== draw.winnerNumber),
            random,
          ),
          style,
        },
        spinSeconds: toSeconds(planFinalTable(draw.numbers.length).totalMs),
      };
    case "slotMachine":
      return {
        motion: { from: [pickIndex(random, 10), pickIndex(random, 10)], style },
        spinSeconds: toSeconds(slotMachineTotalMs()),
      };
    case "spotlight":
      return {
        motion: { hops: pickSpotlightHops(random, draw), style },
        spinSeconds: toSeconds(spotlightTotalMs(SPOTLIGHT_HOPS)),
      };
    default:
      return buildReelMotion(random, style);
  }
}

function readNumbers(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : [];
}

function readDigit(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9
    ? value
    : 0;
}

/**
 * The run stored with a draw, as the screen can play it.
 *
 * A scene is mended rather than refused: whatever it names that is not in the draw is
 * dropped, whoever it leaves out is added, and it always ends on the winner. Anything
 * that is not a scene is read as a reel — the classic one when it cannot be read at all.
 */
export function readRaffleMotion(value: unknown, draw: SceneDraw): RaffleMotion {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : null;

  switch (item?.style) {
    case "finalTable": {
      const others = draw.numbers.filter((number) => number !== draw.winnerNumber);
      const stored = [...new Set(readNumbers(item.order))].filter((number) =>
        others.includes(number),
      );
      return {
        order: [...stored, ...others.filter((number) => !stored.includes(number))],
        style: "finalTable",
      };
    }
    case "slotMachine": {
      const from = Array.isArray(item.from) ? item.from : [];
      return { from: [readDigit(from[0]), readDigit(from[1])], style: "slotMachine" };
    }
    case "spotlight": {
      const hops = readNumbers(item.hops).filter((number) => draw.numbers.includes(number));
      if (hops.at(-1) !== draw.winnerNumber) hops.push(draw.winnerNumber);
      return { hops, style: "spotlight" };
    }
    default:
      return readReelMotion(value);
  }
}

export function isSceneMotion(motion: RaffleMotion): motion is SceneMotion {
  return (SCENE_STYLES as readonly string[]).includes(motion.style);
}

/**
 * Rows and columns for a table of faces on the hall's screen: cards a little wider than
 * tall, filling a box `aspect` times as wide as it is high.
 */
export function faceGridShape(count: number, aspect = 2.8) {
  const total = Math.max(1, count);
  let best = { cols: total, rows: 1, score: Number.POSITIVE_INFINITY };

  for (let rows = 1; rows <= 6; rows += 1) {
    const cols = Math.ceil(total / rows);
    // A last row left empty is a shape for fewer faces.
    if (cols * (rows - 1) >= total) continue;

    const score = Math.abs((aspect * rows) / cols - 1.1);
    if (score < best.score) best = { cols, rows, score };
  }

  return { cols: best.cols, rows: best.rows };
}

/** "1 игрок", "3 игрока", "5 игроков". */
export function countWord(count: number, [one, few, many]: [string, string, string]) {
  const tens = count % 100;
  const units = count % 10;

  if (units === 1 && tens !== 11) return `${count} ${one}`;
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return `${count} ${few}`;
  return `${count} ${many}`;
}
