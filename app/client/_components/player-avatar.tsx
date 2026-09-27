"use client";

import { useState } from "react";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";
import { HandCards } from "./hand-cards";

export function PlayerAvatar({
  hand,
  name,
  photoUrl,
  size = 48,
}: {
  /** The player's favourite hand ("QsTs"), drawn over the corner of the face. */
  hand?: string | null;
  name: string;
  photoUrl?: string;
  size?: number;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  const src = toOwnOriginMediaUrl(photoUrl);
  // A photo that will not load wears the letter, like a player with no photo at all,
  // rather than an empty circle. Kept per address, so a new photo gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const face = (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-[#b8163c] to-[#7d0d26] font-bold"
      style={{ height: size, width: size, fontSize: Math.round(size / 2.4) }}
    >
      {src && src !== failedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
          src={src}
        />
      ) : (
        initial
      )}
    </span>
  );

  if (!hand) return face;

  // The face clips everything round, so the cards sit on a box of their own around it.
  return (
    <span className="relative inline-flex shrink-0" style={{ height: size, width: size }}>
      {face}
      <HandCards hand={hand} size={size} />
    </span>
  );
}
