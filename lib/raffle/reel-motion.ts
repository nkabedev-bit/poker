/**
 * How the raffle reel travels to the winner on the hall's screen.
 *
 * The winner is decided before the reel turns; the reel only travels to them. For weeks
 * it travelled the same way every time — the same ten seconds, the same slowing down,
 * the needle dead on the middle of a card — and the room learned to call the result
 * before it stopped. Each draw now picks one of five ways to get there, runs a few cards
 * further or shorter, one way across the screen or the other, and stops somewhere inside
 * the winner's card.
 *
 * The motion is picked on the server with the result, so every screen plays the same
 * run. Kept free of imports: it is plain arithmetic, shared by the server that picks the
 * motion and the screen that plays it.
 */

export type ReelStyle = "classic" | "windup" | "nearMiss" | "clicks" | "secondWind";

/** Which way the faces run across the screen. */
export type ReelDirection = "left" | "right";

export type ReelMotion = {
  /** Which way the faces run: "left" is the reel the room has always watched. */
  direction: ReelDirection;
  /**
   * How many cards short of the winner the reel first comes to rest: the neighbour it
   * nearly stops on, the cards it then clicks over one by one, or where it stalls before
   * its second push. Zero for a reel that runs straight onto the winner.
   */
  firstStopCells: number;
  /**
   * Where inside the winner's card the needle stops, as a share of the card's width from
   * its middle. Never near the edge: the room reads the face under the needle.
   */
  landingShift: number;
  style: ReelStyle;
  /** How many faces the reel carries before the winner's. */
  travelCells: number;
};

export const REEL_STYLES: readonly ReelStyle[] = [
  "classic",
  "windup",
  "nearMiss",
  "clicks",
  "secondWind",
];

/**
 * How far the reel runs before it settles, counted in faces — the run the room knows.
 *
 * Far enough that the first seconds are a blur, and no further: every cell past this is
 * one more the laptop driving the television has to draw.
 */
export const CLASSIC_TRAVEL_CELLS = 45;

/** The reel every draw ran before there were five, and the one an older draw still runs. */
export const CLASSIC_MOTION: ReelMotion = {
  direction: "left",
  firstStopCells: 0,
  landingShift: 0,
  style: "classic",
  travelCells: CLASSIC_TRAVEL_CELLS,
};

/** A few faces either side of the classic run, so nobody can count the reel down. */
const TRAVEL_CELLS = { max: 52, min: 38 };

/** Well inside the card: the needle must never read as sitting between two faces. */
const MAX_LANDING_SHIFT = 0.28;

/** Where each motion first comes to rest, in cards short of the winner. */
const FIRST_STOP_CELLS: Record<ReelStyle, { max: number; min: number }> = {
  classic: { max: 0, min: 0 },
  clicks: { max: 4, min: 3 },
  nearMiss: { max: 1, min: 1 },
  secondWind: { max: 9, min: 6 },
  windup: { max: 0, min: 0 },
};

/**
 * How long each motion runs, in seconds, give or take `SPIN_JITTER_SECONDS`.
 *
 * None runs past `MAX_REEL_SPIN_SECONDS`: the winner's bot message waits a minute, and a
 * screen whose live connection is down may only pick the draw up 45 seconds in.
 */
const BASE_SECONDS: Record<ReelStyle, number> = {
  classic: 10,
  clicks: 12,
  nearMiss: 11.5,
  secondWind: 12,
  windup: 11,
};

const SPIN_JITTER_SECONDS = 0.5;

export const MAX_REEL_SPIN_SECONDS = Math.max(...Object.values(BASE_SECONDS)) + SPIN_JITTER_SECONDS;

/** The run the reel has always had: straight off at speed, then a long slowing down. */
const CLASSIC_EASING = "cubic-bezier(0.12, 0.72, 0.06, 1)";
/** Creeps off from a standstill, blurs, then brakes. */
const WINDUP_EASING = "cubic-bezier(0.6, 0, 0.15, 1)";
/** A short move from rest to rest: a click onto the next card, the last nudge onto the winner. */
const PUSH_EASING = "cubic-bezier(0.45, 0, 0.25, 1)";
/** The second push after a stall: gathers speed again, then a long slowing down. */
const SECOND_PUSH_EASING = "cubic-bezier(0.5, 0, 0.1, 1)";

/** How the clicks are timed, in seconds. The last one is slower: that is the one the room waits on. */
const CLICK_TIMING = { click: 0.6, lastClick: 1.2, pause: 0.5 };

function pickWholeNumber(random: () => number, { max, min }: { max: number; min: number }) {
  return Math.min(max, min + Math.floor(random() * (max - min + 1)));
}

/**
 * How tonight's draw travels, and for how long.
 *
 * The room sees at most two draws an evening, and the second never runs the way the
 * first did.
 */
export function pickReelMotion(
  random: () => number,
  previous?: ReelStyle | null,
): { motion: ReelMotion; spinSeconds: number } {
  const styles = REEL_STYLES.filter((style) => style !== previous);
  const style = styles[Math.min(styles.length - 1, Math.floor(random() * styles.length))];

  return buildReelMotion(random, style);
}

/** The run of one chosen way: its direction, length, landing point and duration. */
export function buildReelMotion(
  random: () => number,
  style: ReelStyle,
): { motion: ReelMotion; spinSeconds: number } {
  const motion: ReelMotion = {
    direction: random() < 0.5 ? "left" : "right",
    firstStopCells: pickWholeNumber(random, FIRST_STOP_CELLS[style]),
    landingShift: Math.round((random() * 2 - 1) * MAX_LANDING_SHIFT * 100) / 100,
    style,
    travelCells: pickWholeNumber(random, TRAVEL_CELLS),
  };
  const spinSeconds =
    Math.round((BASE_SECONDS[style] + (random() * 2 - 1) * SPIN_JITTER_SECONDS) * 10) / 10;

  return { motion, spinSeconds };
}

/**
 * The motion stored with a draw, or the classic reel when there is none to read.
 *
 * Draws taken before there were five carry no motion, and a screen must never choke on
 * one it cannot read: whatever is off, the reel still runs — the way it always did.
 */
export function readReelMotion(value: unknown): ReelMotion {
  if (!value || typeof value !== "object") return CLASSIC_MOTION;

  const item = value as Record<string, unknown>;
  const style = REEL_STYLES.find((known) => known === item.style);
  if (!style) return CLASSIC_MOTION;

  const { direction, firstStopCells, landingShift, travelCells } = item;
  const stops = FIRST_STOP_CELLS[style];
  const readable =
    (direction === "left" || direction === "right") &&
    typeof firstStopCells === "number" &&
    Number.isInteger(firstStopCells) &&
    firstStopCells >= stops.min &&
    firstStopCells <= stops.max &&
    typeof landingShift === "number" &&
    Math.abs(landingShift) <= MAX_LANDING_SHIFT &&
    typeof travelCells === "number" &&
    Number.isInteger(travelCells) &&
    travelCells >= TRAVEL_CELLS.min &&
    travelCells <= TRAVEL_CELLS.max;

  if (!readable) return CLASSIC_MOTION;

  return { direction, firstStopCells, landingShift, style, travelCells };
}

/** One leg of the run: how the reel moves, and where it is when the leg ends. */
type Leg = {
  easing: string;
  /** How many cards short of the winner the reel is at the end of the leg. */
  short: number;
  /** When the leg ends, as a share of the whole run. */
  until: number;
};

/** The clicks, timed in seconds and then fitted into the run. */
function planClicks(clicks: number, seconds: number): Leg[] {
  const { click, lastClick, pause } = CLICK_TIMING;
  const clicking = clicks * pause + (clicks - 1) * click + lastClick;
  // A draw stored with a run too short for its clicks has them squeezed rather than
  // eating the whole spin: the fast part is what makes it a reel.
  const scale = Math.min(1, (seconds * 0.6) / clicking);

  let at = seconds - clicking * scale;
  const legs: Leg[] = [{ easing: CLASSIC_EASING, short: clicks, until: at }];

  for (let card = clicks; card >= 1; card -= 1) {
    at += pause * scale;
    legs.push({ easing: "linear", short: card, until: at });
    at += (card === 1 ? lastClick : click) * scale;
    legs.push({ easing: PUSH_EASING, short: card - 1, until: at });
  }

  return legs.map((leg) => ({ ...leg, until: leg.until / seconds }));
}

function planRun(motion: ReelMotion, seconds: number): Leg[] {
  const stop = motion.firstStopCells;

  switch (motion.style) {
    case "windup":
      return [{ easing: WINDUP_EASING, short: 0, until: 1 }];
    case "nearMiss":
      // Comes to rest on the neighbour, hangs there barely moving, then crawls on.
      return [
        { easing: CLASSIC_EASING, short: stop, until: 0.78 },
        { easing: "ease-in-out", short: stop - 0.05, until: 0.87 },
        { easing: PUSH_EASING, short: 0, until: 1 },
      ];
    case "clicks":
      return planClicks(stop, seconds);
    case "secondWind":
      // Stalls well short of the winner long enough for the room to call it, then goes on.
      return [
        { easing: CLASSIC_EASING, short: stop, until: 0.45 },
        { easing: "linear", short: stop, until: 0.53 },
        { easing: SECOND_PUSH_EASING, short: 0, until: 1 },
      ];
    default:
      return [{ easing: CLASSIC_EASING, short: 0, until: 1 }];
  }
}

export type ReelKeyframe = { easing: string; offset: number; transform: string };

function translate(x: number) {
  return `translate3d(${Math.round(x * 10) / 10}px, 0, 0)`;
}

/**
 * The run as keyframes for `Element.animate`, from where the reel stands to `to`.
 *
 * `to` is the offset that puts the needle on the winner, and `pitch` is the distance
 * from one card to the next — both measured off the reel itself, so the stops land on
 * cards whatever the screen. The reel never moves backwards: a stop that the run is too
 * short to reach is simply where the reel already is.
 */
export function buildReelKeyframes(
  motion: ReelMotion,
  { pitch, seconds, to }: { pitch: number; seconds: number; to: number },
): ReelKeyframe[] {
  const distance = Math.abs(to);
  const direction = Math.sign(to) || 1;
  const legs = planRun(motion, seconds);

  const keyframes: ReelKeyframe[] = [{ easing: legs[0].easing, offset: 0, transform: translate(0) }];
  let travelled = 0;

  legs.forEach((leg, index) => {
    const last = index === legs.length - 1;
    // Clamped to the run: never back past the last stop, never beyond the winner.
    travelled = last
      ? distance
      : Math.min(distance, Math.max(travelled, distance - leg.short * pitch));

    keyframes.push({
      easing: legs[index + 1]?.easing ?? "linear",
      offset: last ? 1 : leg.until,
      transform: translate(direction * travelled),
    });
  });

  return keyframes;
}
