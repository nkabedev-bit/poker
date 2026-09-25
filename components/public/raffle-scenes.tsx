"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { RaffleStage, usePhotoPreload, useRaffleFaces } from "@/components/public/raffle-stage";
import type { Raffle, RaffleFace } from "@/lib/raffle/raffle";
import {
  countWord,
  faceGridShape,
  planFinalTable,
  SLOT_MACHINE_TIMING,
  SPOTLIGHT_TIMING,
  spotlightHopDurations,
  type FinalTableMotion,
  type SlotMachineMotion,
  type SpotlightMotion,
} from "@/lib/raffle/raffle-scenes";

type FaceState = "hu" | "lit" | "out" | "win" | null;

const PLAYERS: [string, string, string] = ["игрок", "игрока", "игроков"];
const NUMBERS: [string, string, string] = ["номер", "номера", "номеров"];

/**
 * The room as a table of faces, the way the final table and the spotlight play it: the
 * club's photo where it arrived in time, the first letter of the nickname where it did
 * not, and the nickname and number on every card.
 */
function FaceGrid({
  arrived,
  dark = false,
  faces,
  stateOf,
}: {
  arrived: string[];
  dark?: boolean;
  faces: RaffleFace[];
  stateOf: (number: number) => FaceState;
}) {
  const { cols, rows } = faceGridShape(faces.length);

  return (
    <div
      className={dark ? "raffle-grid raffle-grid--dark" : "raffle-grid"}
      style={{ "--cols": cols, "--rows": rows } as CSSProperties}
    >
      {faces.map((face, index) => {
        const state = stateOf(face.number);
        const photo = face.avatarUrl && arrived.includes(face.avatarUrl) ? face.avatarUrl : null;

        return (
          <div
            className={state ? `raffle-face raffle-face--${state}` : "raffle-face"}
            data-number={face.number}
            key={face.number}
            // A wave goes out a card at a time, not as one block.
            style={state === "out" ? { transitionDelay: `${(index * 97) % 380}ms` } : undefined}
          >
            <span className="raffle-face__number">{face.number}</span>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="raffle-face__photo" decoding="async" src={photo} />
            ) : (
              <span className="raffle-face__initial">
                {face.name.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
            )}
            <span className="raffle-face__name">{face.name}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The final table: the room knocked out wave by wave — in batches at first, then one at
 * a time with longer and longer pauses — until the winner is the only one left.
 */
export function FinalTableScene({ motion, raffle }: { motion: FinalTableMotion; raffle: Raffle }) {
  const faces = useRaffleFaces(raffle);
  const { arrived, ready } = usePhotoPreload(faces);
  const plan = useMemo(() => planFinalTable(faces.length), [faces.length]);
  const [wave, setWave] = useState(-1);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!ready) return;

    const timers = plan.waves.map((step, index) =>
      window.setTimeout(() => setWave(index), step.atMs),
    );
    timers.push(window.setTimeout(() => setSettled(true), plan.totalMs));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [plan, ready]);

  const remaining = wave < 0 ? faces.length : plan.waves[wave].remaining;
  const out = new Set(motion.order.slice(0, Math.max(0, faces.length - remaining)));
  const stillIn = faces
    .filter((face) => !out.has(face.number))
    .sort((a, b) => a.number - b.number);

  const stateOf = (number: number): FaceState => {
    if (out.has(number)) return "out";
    if (remaining === 1) return number === raffle.winnerNumber ? "win" : null;
    return remaining === 2 ? "hu" : null;
  };

  // The heads-up is named in seat order, so the order of the names gives nothing away.
  let status = `В игре ${countWord(remaining, PLAYERS)}`;
  if (remaining === 1) status = "";
  else if (remaining === 2 && stillIn.length === 2) {
    status = `Хедз-ап: ${stillIn[0].name} против ${stillIn[1].name}`;
  } else if (remaining <= 5) status = `Осталось ${remaining}`;

  return (
    <RaffleStage raffle={raffle} scene settled={settled}>
      <div className="raffle-scene">
        <FaceGrid arrived={arrived} faces={faces} stateOf={stateOf} />
        <p className="raffle-status">{status}</p>
      </div>
    </RaffleStage>
  );
}

/** How many times each drum carries its ten digits: enough for the run and one to spare. */
const TENS_REPEATS = 6;
const UNITS_REPEATS = 14;

/** Where a drum stands with its `index`-th cell on the pay line, as a share of its strip. */
function drumAt(index: number, cells: number) {
  return `translateY(${(-(index - 1) * 100) / cells}%)`;
}

function Drum({
  from,
  repeats,
  stripRef,
}: {
  from: number;
  repeats: number;
  stripRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="raffle-slot__reel">
      <div
        className="raffle-slot__strip"
        ref={stripRef}
        style={{ transform: drumAt(10 + from, repeats * 10) }}
      >
        {Array.from({ length: repeats * 10 }, (_, index) => (
          <div className="raffle-slot__digit" key={index}>
            {index % 10}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The one-armed bandit: two drums for the winning number. The tens stop first and leave
 * the room with the ten numbers of that decade; the units run on and pick one of them.
 */
export function SlotMachineScene({ motion, raffle }: { motion: SlotMachineMotion; raffle: Raffle }) {
  const faces = useRaffleFaces(raffle);
  const [phase, setPhase] = useState<"spinning" | "tens" | "units">("spinning");
  const [settled, setSettled] = useState(false);
  const tensRef = useRef<HTMLDivElement>(null);
  const unitsRef = useRef<HTMLDivElement>(null);

  const tens = Math.floor(raffle.winnerNumber / 10);
  const units = raffle.winnerNumber % 10;
  const byNumber = useMemo(() => [...faces].sort((a, b) => a.number - b.number), [faces]);
  const decade = byNumber.filter((face) => Math.floor(face.number / 10) === tens);

  useEffect(() => {
    const { leverMs, settleMs, tensMs, unitsMs } = SLOT_MACHINE_TIMING;
    const tensCells = TENS_REPEATS * 10;
    const unitsCells = UNITS_REPEATS * 10;
    // Stopped a whole round before the end of the strip, so a face stands below the line.
    const tensTo = (TENS_REPEATS - 2) * 10 + tens;
    const unitsTo = (UNITS_REPEATS - 2) * 10 + units;
    const unitsFrom = 10 + motion.from[1];
    // The units drum keeps its speed while the tens settle, then brakes into the number.
    const cruise = unitsTo - (unitsTo - unitsFrom) / 4.65;

    const runs = [
      {
        cells: tensCells,
        frames: [
          { transform: drumAt(10 + motion.from[0], tensCells) },
          { transform: drumAt(tensTo, tensCells) },
        ],
        options: { duration: tensMs, easing: "cubic-bezier(.12,.62,.18,1)" },
        strip: tensRef.current,
        to: tensTo,
      },
      {
        cells: unitsCells,
        frames: [
          { easing: "linear", transform: drumAt(unitsFrom, unitsCells) },
          {
            easing: "cubic-bezier(.2,.6,.2,1)",
            offset: 0.55,
            transform: drumAt(cruise, unitsCells),
          },
          { transform: drumAt(unitsTo, unitsCells) },
        ],
        options: { duration: unitsMs },
        strip: unitsRef.current,
        to: unitsTo,
      },
    ];

    const animations: Animation[] = [];
    for (const run of runs) {
      if (!run.strip) continue;

      if (typeof run.strip.animate === "function") {
        animations.push(
          run.strip.animate(run.frames, { ...run.options, delay: leverMs, fill: "forwards" }),
        );
      } else {
        // A browser without the animation engine is simply shown where the drums stop.
        run.strip.style.transform = drumAt(run.to, run.cells);
      }
    }

    const timers = [
      window.setTimeout(() => setPhase("tens"), leverMs + tensMs),
      window.setTimeout(() => setPhase("units"), leverMs + unitsMs),
      window.setTimeout(() => setSettled(true), leverMs + unitsMs + settleMs),
    ];

    return () => {
      animations.forEach((animation) => animation.cancel());
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [motion, tens, units]);

  let heading = `В барабане ${countWord(faces.length, NUMBERS)}`;
  if (phase === "units") heading = `Номер ${raffle.winnerNumber}`;
  else if (phase === "tens") {
    heading = `Десяток ${tens}`;
    if (decade.length === 1) heading += `: номер ${decade[0].number}`;
    if (decade.length > 1) heading += `: номера ${decade[0].number}–${decade.at(-1)?.number}`;
  }

  return (
    <RaffleStage raffle={raffle} scene settled={settled}>
      <div className="raffle-slot">
        <div className="raffle-slot__machine">
          <p className="raffle-slot__marquee">Majestic</p>
          <div className="raffle-slot__reels">
            <Drum from={motion.from[0]} repeats={TENS_REPEATS} stripRef={tensRef} />
            <Drum from={motion.from[1]} repeats={UNITS_REPEATS} stripRef={unitsRef} />
            <span className="raffle-slot__payline" />
          </div>
          <span className="raffle-slot__lever">
            <span className="raffle-slot__knob" />
          </span>
        </div>

        <div className="raffle-slot__board">
          <p className="raffle-slot__head">{heading}</p>
          {phase === "spinning" ? (
            <div className="raffle-slot__pills">
              {byNumber.map((face) => (
                <span className="raffle-slot__pill" key={face.number}>
                  {face.number}
                </span>
              ))}
            </div>
          ) : (
            <div className="raffle-slot__rows">
              {decade.map((face) => {
                let state = "";
                if (phase === "units") {
                  state =
                    face.number === raffle.winnerNumber
                      ? " raffle-slot__row--win"
                      : " raffle-slot__row--out";
                }

                return (
                  <div className={`raffle-slot__row${state}`} key={face.number}>
                    <b>{face.number}</b>
                    <span>{face.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </RaffleStage>
  );
}

/**
 * The spotlight: the room goes dark and a light hops from face to face, quick at first
 * and slower with every hop, until it rests on the winner and the lights come back on.
 */
export function SpotlightScene({ motion, raffle }: { motion: SpotlightMotion; raffle: Raffle }) {
  const faces = useRaffleFaces(raffle);
  const { arrived, ready } = usePhotoPreload(faces);
  const durations = useMemo(() => spotlightHopDurations(motion.hops.length), [motion.hops.length]);
  const [phase, setPhase] = useState<"waiting" | "dark" | "lights">("waiting");
  const [hop, setHop] = useState(-1);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!ready) return;

    const { darkenMs, holdMs, lightsMs } = SPOTLIGHT_TIMING;
    const timers = [window.setTimeout(() => setPhase("dark"), 0)];
    let at = darkenMs;

    durations.forEach((duration, index) => {
      timers.push(window.setTimeout(() => setHop(index), at));
      at += duration;
    });
    timers.push(window.setTimeout(() => setPhase("lights"), at + holdMs));
    timers.push(window.setTimeout(() => setSettled(true), at + holdMs + lightsMs));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [durations, ready]);

  const lit = hop >= 0 ? motion.hops[hop] : null;
  const stateOf = (number: number): FaceState => {
    if (phase === "lights") return number === raffle.winnerNumber ? "win" : null;
    return phase === "dark" && number === lit ? "lit" : null;
  };

  return (
    <RaffleStage raffle={raffle} scene settled={settled}>
      <div className="raffle-scene">
        <FaceGrid arrived={arrived} dark={phase === "dark"} faces={faces} stateOf={stateOf} />
      </div>
    </RaffleStage>
  );
}
