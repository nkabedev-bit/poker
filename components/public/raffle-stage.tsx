"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";
import type { Raffle, RaffleFace } from "@/lib/raffle/raffle";

/**
 * Long enough for the club's faces to arrive over the hall's wifi, short enough that
 * the room is not left looking at a still screen while they load.
 */
const PRELOAD_TIMEOUT_MS = 1500;

/**
 * Everyone in the draw, with photos asked for from the club's own domain.
 *
 * A draw taken before faces were stored carries numbers and no faces; it runs as the
 * numbers it was stored with rather than not at all.
 */
export function useRaffleFaces(raffle: Raffle): RaffleFace[] {
  return useMemo(
    () =>
      raffle.faces?.length
        ? raffle.faces.map((face) => ({
            ...face,
            avatarUrl: toOwnOriginMediaUrl(face.avatarUrl) ?? null,
          }))
        : raffle.numbers.map((number) => ({ avatarUrl: null, name: String(number), number })),
    [raffle.faces, raffle.numbers],
  );
}

/** Every photo the draw's faces carry, each asked for once. */
export function photoUrls(faces: RaffleFace[]) {
  return [
    ...new Set(faces.map((face) => face.avatarUrl).filter((url): url is string => Boolean(url))),
  ];
}

/**
 * Asks for the draw's photos, and is `done` once they are all here or the room has
 * waited long enough.
 *
 * Only the photos that arrive by then are reported: one still on its way — or one that
 * never comes — stays a nickname, because a picture appearing mid-flight reads as a
 * broken screen.
 */
export function preloadPhotos(urls: string[], onArrive: (url: string) => void) {
  let settled = false;
  let timeout = 0;

  const loaded = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const image = new window.Image();
        image.onload = () => {
          if (!settled) onArrive(url);
          resolve();
        };
        image.onerror = () => resolve();
        image.src = url;
      }),
  );

  const done = Promise.race([
    Promise.all(loaded),
    new Promise((resolve) => {
      timeout = window.setTimeout(resolve, PRELOAD_TIMEOUT_MS);
    }),
  ]).then(() => {
    settled = true;
  });

  return {
    cancel: () => {
      settled = true;
      window.clearTimeout(timeout);
    },
    done,
  };
}

/** The same for a scene: which photos made it, and whether it may start. */
export function usePhotoPreload(faces: RaffleFace[]) {
  const [arrived, setArrived] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const urls = useMemo(() => photoUrls(faces), [faces]);

  useEffect(() => {
    let cancelled = false;
    const preload = preloadPhotos(urls, (url) => {
      if (!cancelled) setArrived((list) => (list.includes(url) ? list : [...list, url]));
    });

    void preload.done.then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
      preload.cancel();
    };
  }, [urls]);

  return { arrived, ready };
}

/**
 * The draw over the whole screen: its title, whatever runs to the winner, and the
 * winner's name once it has got there. The same frame for the reel and every scene.
 *
 * A scene lays the whole room out on the screen, so its result is read on one line —
 * the number beside the name — and the faces get the height the reel's tall result
 * would have kept empty all the way through the draw.
 */
export function RaffleStage({
  children,
  raffle,
  scene = false,
  settled,
}: {
  children: ReactNode;
  raffle: Raffle;
  scene?: boolean;
  settled: boolean;
}) {
  return (
    <div className="raffle-overlay">
      <div className={scene ? "raffle-stage raffle-stage--scene" : "raffle-stage"}>
        <p className="raffle-title">
          {raffle.kind === "vip" ? "VIP розыгрыш" : "Розыгрыш бесплатной проходки"}
        </p>

        {children}

        <div className={settled ? "raffle-result raffle-result--shown" : "raffle-result"}>
          <div className="raffle-result__lead">
            <p className="raffle-result__label">Победил номер</p>
            <p className="raffle-result__number">{raffle.winnerNumber}</p>
          </div>
          <div className="raffle-result__who">
            <p className="raffle-result__name">{raffle.winnerName}</p>
            <p className="raffle-result__prize">
              {raffle.kind === "vip"
                ? "Приз от партнёров клуба"
                : "Бесплатная проходка на следующую игру"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
