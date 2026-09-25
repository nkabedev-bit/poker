"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FinalTableScene,
  SlotMachineScene,
  SpotlightScene,
} from "@/components/public/raffle-scenes";
import {
  photoUrls,
  preloadPhotos,
  RaffleStage,
  useRaffleFaces,
} from "@/components/public/raffle-stage";
import { buildRaffleReel, type Raffle } from "@/lib/raffle/raffle";
import { readRaffleMotion } from "@/lib/raffle/raffle-scenes";
import { buildReelKeyframes, type ReelMotion } from "@/lib/raffle/reel-motion";

/**
 * The draw, over the whole screen.
 *
 * The winner was decided on the server; what the room watches is an animation that
 * lands on it, so the room sees one result and it cannot be argued with. Which one — a
 * reel of faces running past a needle, or one of the scenes — came with the draw, so
 * every screen runs alike.
 *
 * Each draw gets a run of its own. The screen refreshes its state while it plays — a
 * poll, somebody knocked out at another table — and every refresh hands over a new copy
 * of the same draw; a run that restarted on those would lose the timer that shows the
 * result, and the room would never be told who won.
 */
export function RaffleStrip({ raffle }: { raffle: Raffle }) {
  return <RaffleRun initialRaffle={raffle} key={raffle.id} />;
}

function RaffleRun({ initialRaffle }: { initialRaffle: Raffle }) {
  // The draw as it stood when it started. Nothing in it that the room sees changes
  // afterwards, and a copy that arrives mid-run must not restart it.
  const [raffle] = useState(initialRaffle);
  const motion = useMemo(
    () =>
      readRaffleMotion(raffle.motion, {
        numbers: raffle.faces?.map((face) => face.number) ?? raffle.numbers,
        winnerNumber: raffle.winnerNumber,
      }),
    [raffle],
  );

  switch (motion.style) {
    case "finalTable":
      return <FinalTableScene motion={motion} raffle={raffle} />;
    case "slotMachine":
      return <SlotMachineScene motion={motion} raffle={raffle} />;
    case "spotlight":
      return <SpotlightScene motion={motion} raffle={raffle} />;
    default:
      return <RaffleReel motion={motion} raffle={raffle} />;
  }
}

/**
 * Faces run past a needle in the middle and stop with the winner under it — a player
 * with no photo rides past as their nickname, which is how the hall knows them anyway.
 * How the reel gets there — which way, how far, with which stops on the way — is the
 * draw's motion.
 */
function RaffleReel({ motion, raffle }: { motion: ReelMotion; raffle: Raffle }) {
  const [settled, setSettled] = useState(false);
  // Photos that were here before the reel moved. Only these ride as faces.
  const [arrived, setArrived] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const faces = useRaffleFaces(raffle);
  const winnerIndex = Math.max(0, faces.findIndex((face) => face.number === raffle.winnerNumber));
  const reel = useMemo(
    () => buildRaffleReel(faces.length, winnerIndex, motion.travelCells),
    [faces.length, motion.travelCells, winnerIndex],
  );
  const cells = useMemo(
    () =>
      Array.from(
        { length: reel.length },
        (_, index) => faces[(index + reel.startOffset) % faces.length],
      ),
    [faces, reel.length, reel.startOffset],
  );

  useEffect(() => {
    let cancelled = false;
    let animation: Animation | null = null;
    const timers: number[] = [];

    const start = () => {
      const wrap = wrapRef.current;
      const strip = stripRef.current;
      const cell = strip?.children[reel.landingIndex] as HTMLElement | undefined;
      if (cancelled || !wrap || !strip || !cell) return;

      // Measured off the cells themselves. A width worked out from the stylesheet puts
      // the needle beside the winner the day a gap or a font changes, and the room reads
      // the face under the needle, not the panel underneath. The needle stops wherever
      // inside the winner's card the draw said — never on its edge.
      const first = strip.children[0] as HTMLElement;
      const second = strip.children[1] as HTMLElement | undefined;
      const pitch = second ? Math.abs(second.offsetLeft - first.offsetLeft) : cell.offsetWidth;
      const to = -(
        cell.offsetLeft +
        cell.offsetWidth * (0.5 + motion.landingShift) -
        wrap.clientWidth / 2
      );
      const keyframes = buildReelKeyframes(motion, { pitch, seconds: raffle.spinSeconds, to });

      if (typeof strip.animate === "function") {
        animation = strip.animate(keyframes, {
          duration: raffle.spinSeconds * 1000,
          fill: "forwards",
        });
      } else {
        // A browser without the animation engine is simply shown where the reel stops.
        strip.style.transform = keyframes[keyframes.length - 1].transform;
      }

      timers.push(
        window.setTimeout(() => setSettled(true), raffle.spinSeconds * 1000 + 200),
      );
    };

    // Nothing moves until the faces are here, or until the room has waited long enough.
    const preload = preloadPhotos(photoUrls(faces), (url) => {
      if (!cancelled) setArrived((list) => (list.includes(url) ? list : [...list, url]));
    });

    void preload.done.then(() => {
      if (cancelled) return;
      // One frame at rest first, so the browser animates from a standstill rather than
      // jumping to the end.
      window.requestAnimationFrame(start);
    });

    return () => {
      cancelled = true;
      preload.cancel();
      animation?.cancel();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [faces, motion, raffle.spinSeconds, reel.landingIndex]);

  return (
    <RaffleStage raffle={raffle} settled={settled}>
      <div className="raffle-strip-wrap" ref={wrapRef}>
        <span className="raffle-needle" />
        {/* Run the other way, the reel is mirrored: it starts where it stands either way,
            and the same run lands on the same card. */}
        <div
          className={
            motion.direction === "right" ? "raffle-strip raffle-strip--reverse" : "raffle-strip"
          }
          ref={stripRef}
        >
          {cells.map((face, index) => {
            const photo =
              face.avatarUrl && arrived.includes(face.avatarUrl) ? face.avatarUrl : null;

            return (
              <div
                className={
                  settled && index === reel.landingIndex
                    ? "raffle-cell raffle-cell--winner"
                    : "raffle-cell"
                }
                key={`${face.number}-${index}`}
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="raffle-cell__photo"
                    decoding="async"
                    // Loaded once already, so this is rare; a nickname still beats a hole.
                    onError={() => setArrived((list) => list.filter((url) => url !== photo))}
                    src={photo}
                  />
                ) : (
                  <span className="raffle-cell__name">{face.name}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </RaffleStage>
  );
}
