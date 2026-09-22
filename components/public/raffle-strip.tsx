"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";
import { buildRaffleReel, type Raffle, type RaffleFace } from "@/lib/raffle/raffle";
import { buildReelKeyframes, readReelMotion } from "@/lib/raffle/reel-motion";

/**
 * Long enough for the club's faces to arrive over the hall's wifi, short enough that
 * the room is not left looking at a still reel while they load.
 */
const PRELOAD_TIMEOUT_MS = 1500;

/**
 * The draw, over the whole screen.
 *
 * The winner was decided on the server; the reel is an animation that lands on it, so
 * the room sees one result and it cannot be argued with. Faces run past a needle in the
 * middle and stop with the winner under it — a player with no photo rides past as their
 * nickname, which is how the hall knows them anyway. How the reel gets there — which way,
 * how far, with which stops on the way — came with the draw, so every screen runs alike.
 *
 * Each draw gets a reel of its own. The screen refreshes its state while the reel is
 * turning — a poll, somebody knocked out at another table — and every refresh hands
 * over a new copy of the same draw; a reel that restarted on those would lose the timer
 * that shows the result, and the room would never be told who won.
 */
export function RaffleStrip({ raffle }: { raffle: Raffle }) {
  return <RaffleReel initialRaffle={raffle} key={raffle.id} />;
}

function RaffleReel({ initialRaffle }: { initialRaffle: Raffle }) {
  // The draw as it stood when the reel started. Nothing in it that the room sees
  // changes afterwards, and a copy that arrives mid-spin must not restart it.
  const [raffle] = useState(initialRaffle);
  const [settled, setSettled] = useState(false);
  // Photos that were here before the reel moved. Only these ride as faces: one still on
  // its way — or one that never comes — rides past as the nickname, because a picture
  // appearing mid-flight reads as a broken screen.
  const [arrived, setArrived] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // A draw taken before the reel existed carries numbers and no faces; it runs as the
  // numbers it was stored with rather than not at all.
  const faces: RaffleFace[] = useMemo(
    () =>
      raffle.faces?.length
        ? raffle.faces.map((face) => ({
            ...face,
            avatarUrl: toOwnOriginMediaUrl(face.avatarUrl) ?? null,
          }))
        : raffle.numbers.map((number) => ({ avatarUrl: null, name: String(number), number })),
    [raffle.faces, raffle.numbers],
  );

  // A draw taken before there were five runs the reel it always had.
  const motion = useMemo(() => readReelMotion(raffle.motion), [raffle.motion]);
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
    let started = false;
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
    const urls = [
      ...new Set(
        faces.map((face) => face.avatarUrl).filter((url): url is string => Boolean(url)),
      ),
    ];
    const loaded = urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new window.Image();
          image.onload = () => {
            if (!cancelled && !started) {
              setArrived((list) => (list.includes(url) ? list : [...list, url]));
            }
            resolve();
          };
          image.onerror = () => resolve();
          image.src = url;
        }),
    );

    void Promise.race([
      Promise.all(loaded),
      new Promise((resolve) => timers.push(window.setTimeout(resolve, PRELOAD_TIMEOUT_MS))),
    ]).then(() => {
      if (cancelled) return;
      // From here on the reel is what it is: a face still on its way stays a nickname.
      started = true;
      // One frame at rest first, so the browser animates from a standstill rather than
      // jumping to the end.
      window.requestAnimationFrame(start);
    });

    return () => {
      cancelled = true;
      animation?.cancel();
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [faces, motion, raffle.spinSeconds, reel.landingIndex]);

  return (
    <div className="raffle-overlay">
      <div className="raffle-stage">
        <p className="raffle-title">
          {raffle.kind === "vip" ? "VIP розыгрыш" : "Розыгрыш бесплатной проходки"}
        </p>

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

        <div className={settled ? "raffle-result raffle-result--shown" : "raffle-result"}>
          <p className="raffle-result__label">Победил номер</p>
          <p className="raffle-result__number">{raffle.winnerNumber}</p>
          <p className="raffle-result__name">{raffle.winnerName}</p>
          <p className="raffle-result__prize">
            {raffle.kind === "vip"
              ? "Приз от партнёров клуба"
              : "Бесплатная проходка на следующую игру"}
          </p>
        </div>
      </div>
    </div>
  );
}
