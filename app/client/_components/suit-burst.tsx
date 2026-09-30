"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type Particle = {
  color: string;
  delay: number;
  dx: number;
  dy: number;
  id: string;
  rot: number;
  suit: string;
};

const SUITS = ["♠", "♥", "♦", "♣"] as const;

/** How long the suits take to fall away, a little over the animation itself. */
const BURST_MS = 1500;

/**
 * A handful of card suits thrown up and falling away — the club's confetti, for the
 * moments a player has just done something that counts: a seat taken, an award won.
 *
 * `fire` throws them from the middle of the nearest positioned ancestor of `burst`, so
 * the element that holds it needs `relative`. With reduced motion they vanish at once.
 */
export function useSuitBurst(count = 26) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const clearTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  const fire = useCallback(() => {
    const thrownAt = Date.now();

    setParticles(
      Array.from({ length: count }, (_, index) => {
        const suit = SUITS[index % SUITS.length];
        // Upwards, anywhere across the half-circle above the point they leave from.
        const angle = Math.PI + Math.random() * Math.PI;
        const speed = 80 + Math.random() * 120;

        return {
          color: suit === "♥" || suit === "♦" ? "#f0647c" : index % 3 ? "#f4eee6" : "#e2bc6e",
          delay: Math.round(Math.random() * 90),
          dx: Math.round(Math.cos(angle) * speed),
          dy: Math.round(Math.sin(angle) * speed - 30),
          id: `${thrownAt}-${index}`,
          rot: Math.round(Math.random() * 720 - 360),
          suit,
        };
      }),
    );

    if (clearTimer.current) window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setParticles([]), BURST_MS);
  }, [count]);

  const burst =
    particles.length > 0 ? (
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-20">
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="client-confetti"
            style={
              {
                "--dx": `${particle.dx}px`,
                "--dy": `${particle.dy}px`,
                "--rot": `${particle.rot}deg`,
                animationDelay: `${particle.delay}ms`,
                color: particle.color,
              } as CSSProperties
            }
          >
            {particle.suit}
          </span>
        ))}
      </span>
    ) : null;

  return { burst, fire };
}
