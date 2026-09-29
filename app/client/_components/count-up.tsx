"use client";

import { useLayoutEffect, useRef } from "react";

/** How long a number takes to reach its value. */
const COUNT_MS = 900;

/** A phone that asked for less motion, or cannot say, gets the number at once. */
function mayMove() {
  return (
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A number that counts up to its value as the screen opens — the player's games,
 * knockouts, their place climbing the rating — instead of simply being there.
 *
 * The frames are written straight into the text rather than through state, so a count
 * costs no re-render of the screen around it. `from` counts the other way (a place
 * falling from the bottom of the table), and `suffix` rides along ("23 / 43").
 */
export function CountUp({
  from = 0,
  suffix = "",
  value,
}: {
  from?: number;
  suffix?: string;
  value: number;
}) {
  const node = useRef<HTMLSpanElement>(null);

  // Before the first paint, so the final number never flashes up ahead of the count.
  useLayoutEffect(() => {
    const span = node.current;
    if (!span || from === value || !mayMove()) return;

    const started = performance.now();
    let frame = 0;

    const draw = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - started) / COUNT_MS));
      const eased = 1 - (1 - progress) ** 3;
      span.textContent = `${Math.round(from + (value - from) * eased)}${suffix}`;
      if (progress < 1) frame = requestAnimationFrame(draw);
    };

    draw(started);

    return () => {
      cancelAnimationFrame(frame);
      span.textContent = `${value}${suffix}`;
    };
  }, [from, suffix, value]);

  return <span ref={node}>{`${value}${suffix}`}</span>;
}
