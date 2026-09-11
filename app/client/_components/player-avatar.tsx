"use client";

import { useState } from "react";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";

export function PlayerAvatar({
  name,
  photoUrl,
  size = 48,
}: {
  name: string;
  photoUrl?: string;
  size?: number;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  const src = toOwnOriginMediaUrl(photoUrl);
  // A photo that will not load wears the letter, like a player with no photo at all,
  // rather than an empty circle. Kept per address, so a new photo gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
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
}
