"use client";

import { useState } from "react";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";
import { HandCards } from "./hand-cards";

// Muted, warm faces for players with no photo, one per name so a list does not read
// as a single colour.
const FACE_COLORS = ["#4A2A33", "#2F3A45", "#3E3528", "#2D3B34", "#3A2F45", "#45302A"];

/** "Дмитрий Кабедев" → "ДК", "Shark_PTZ" → "SH". */
export function playerInitials(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length > 1) return `${[...words[0]][0]}${[...words[1]][0]}`.toUpperCase();

  return [...words[0]].slice(0, 2).join("").toUpperCase();
}

function faceColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return FACE_COLORS[hash % FACE_COLORS.length];
}

export function PlayerAvatar({
  dealHand = false,
  hand,
  name,
  photoUrl,
  ring,
  size = 48,
}: {
  /** Deal the hand onto the face as it appears — for the moment the player picks it. */
  dealHand?: boolean;
  /** The player's favourite hand ("QsTs"), drawn over the corner of the face. */
  hand?: string | null;
  name: string;
  photoUrl?: string;
  /** A coloured ring around the face: crimson for the player's own, gold for a champion. */
  ring?: "crimson" | "gold";
  size?: number;
}) {
  const initials = playerInitials(name);
  const src = toOwnOriginMediaUrl(photoUrl);
  // A photo that will not load wears the letter, like a player with no photo at all,
  // rather than an empty circle. Kept per address, so a new photo gets its own chance.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const face = (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-display font-semibold text-club-text"
      style={{
        backgroundColor: faceColor(name),
        boxShadow: ring
          ? `0 0 0 2px #0d0a0b, 0 0 0 4px ${ring === "gold" ? "#e2bc6e" : "#c8213f"}`
          : undefined,
        fontSize: Math.round(size / 3),
        height: size,
        width: size,
      }}
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
        initials
      )}
    </span>
  );

  if (!hand) return face;

  // The face clips everything round, so the cards sit on a box of their own around it.
  // A dealt hand sits on a layer the size of the face, keyed by the hand, so a new pick
  // flies in again.
  return (
    <span className="relative inline-flex shrink-0" style={{ height: size, width: size }}>
      {face}
      {dealHand ? (
        <span key={hand} className="client-hand-deal pointer-events-none absolute inset-0">
          <HandCards hand={hand} size={size} />
        </span>
      ) : (
        <HandCards hand={hand} size={size} />
      )}
    </span>
  );
}
