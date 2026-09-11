"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildRaffleReel, type Raffle, type RaffleFace } from "@/lib/raffle/raffle";

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
 * nickname, which is how the hall knows them anyway.
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
  const [offset, setOffset] = useState(0);
  // A face whose picture refused to load rides past as a nickname rather than a hole.
  const [broken, setBroken] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // A draw taken before the reel existed carries numbers and no faces; it runs as the
  // numbers it was stored with rather than not at all.
  const faces: RaffleFace[] = useMemo(
    () =>
      raffle.faces?.length
        ? raffle.faces
        : raffle.numbers.map((number) => ({ avatarUrl: null, name: String(number), number })),
    [raffle.faces, raffle.numbers],
  );

  const winnerIndex = Math.max(0, faces.findIndex((face) => face.number === raffle.winnerNumber));
  const reel = useMemo(
    () => buildRaffleReel(faces.length, winnerIndex),
    [faces.length, winnerIndex],
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
    const timers: number[] = [];

    const start = () => {
      const wrap = wrapRef.current;
      const cell = stripRef.current?.children[reel.landingIndex] as HTMLElement | undefined;
      if (cancelled || !wrap || !cell) return;

      // Measured off the winning cell itself. A width worked out from the stylesheet
      // puts the needle beside the winner the day a gap or a font changes, and the room
      // reads the face under the needle, not the panel underneath.
      setOffset(cell.offsetLeft + cell.offsetWidth / 2 - wrap.clientWidth / 2);
      timers.push(
        window.setTimeout(() => setSettled(true), raffle.spinSeconds * 1000 + 200),
      );
    };

    // Nothing moves until the faces are here: pictures appearing mid-flight read as a
    // broken screen, and the draw is the one moment the room is all looking at it.
    const loaded = faces
      .map((face) => face.avatarUrl)
      .filter((url): url is string => Boolean(url))
      .map(
        (url) =>
          new Promise<void>((resolve) => {
            const image = new window.Image();
            image.onload = () => resolve();
            image.onerror = () => resolve();
            image.src = url;
          }),
      );

    void Promise.race([
      Promise.all(loaded),
      new Promise((resolve) => timers.push(window.setTimeout(resolve, PRELOAD_TIMEOUT_MS))),
    ]).then(() => {
      // One frame at rest first, so the browser animates from a standstill rather than
      // jumping to the end.
      window.requestAnimationFrame(start);
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [faces, raffle.spinSeconds, reel.landingIndex]);

  return (
    <div className="raffle-overlay">
      <div className="raffle-stage">
        <p className="raffle-title">
          {raffle.kind === "vip" ? "VIP розыгрыш" : "Розыгрыш бесплатной проходки"}
        </p>

        <div className="raffle-strip-wrap" ref={wrapRef}>
          <span className="raffle-needle" />
          <div
            className="raffle-strip"
            ref={stripRef}
            style={{
              transform: `translate3d(${-offset}px, 0, 0)`,
              transitionDuration: `${raffle.spinSeconds}s`,
            }}
          >
            {cells.map((face, index) => {
              const photo = face.avatarUrl && !broken.includes(face.avatarUrl)
                ? face.avatarUrl
                : null;

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
                      onError={() =>
                        setBroken((urls) => (urls.includes(photo) ? urls : [...urls, photo]))
                      }
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
