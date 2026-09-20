"use client";

import { useEffect, useRef, useState } from "react";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";
import {
  describeKnockoutOutcome,
  selectKnockoutsToPlay,
  KNOCKOUT_BANNER_SECONDS,
  type KnockoutBanner,
  type KnockoutFace,
} from "@/lib/knockouts/banner";

function Face({ face }: { face: KnockoutFace }) {
  const src = toOwnOriginMediaUrl(face.avatarUrl ?? undefined);

  return (
    <span className="public-knockout__face">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="public-knockout__avatar" src={src} />
      ) : (
        <span className="public-knockout__avatar public-knockout__avatar--letter">
          {face.name.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      )}
      <strong className="public-knockout__name">{face.name}</strong>
    </span>
  );
}

/**
 * The hall's announcement that somebody is out.
 *
 * Over the whole board for a few seconds, like the break notice: the room is looking at
 * the tables, not at the screen, and a line of text in a corner would be read by nobody.
 *
 * Knockouts are played one at a time, in the order they happened. Two players going out
 * between one refresh and the next each get their own turn — on the final table that is
 * the difference between the room hearing one name and hearing both.
 */
export function KnockoutOverlay({ banners }: { banners: KnockoutBanner[] }) {
  const [queue, setQueue] = useState<KnockoutBanner[]>([]);
  // Everything the room has already watched. A refresh hands over the same few banners
  // again — the club keeps the last of them — and without this they would loop.
  const shown = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fresh = selectKnockoutsToPlay(banners, shown.current);
    if (fresh.length === 0) return;

    for (const banner of fresh) shown.current.add(banner.id);
    setQueue((waiting) => [...waiting, ...fresh]);
  }, [banners]);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return;

    const timer = window.setTimeout(
      () => setQueue((waiting) => waiting.slice(1)),
      KNOCKOUT_BANNER_SECONDS * 1000,
    );

    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="public-knockout-overlay" key={current.id} role="status">
      {current.killers.length > 0 ? (
        <>
          <span className="public-knockout__line">
            {current.killers.map((killer) => (
              <Face face={killer} key={killer.name} />
            ))}
            <em className="public-knockout__verb">
              {current.killers.length > 1 ? "выбили" : "выбил"}
            </em>
            <Face face={current.player} />
          </span>
          <span className="public-knockout__outcome">{describeKnockoutOutcome(current)}</span>
        </>
      ) : (
        <>
          <span className="public-knockout__line">
            <Face face={current.player} />
          </span>
          <span className="public-knockout__outcome">{describeKnockoutOutcome(current)}</span>
        </>
      )}
    </div>
  );
}
