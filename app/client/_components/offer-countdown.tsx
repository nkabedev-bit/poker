"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { WAITLIST_OFFER_MINUTES } from "@/lib/events/waitlist";
import { formatEventTimeLabel } from "@/lib/events/types";

export type OfferUrgency = "calm" | "soon" | "last" | "over";

/** The last five minutes turn amber, the last two red. */
const SOON_SECONDS = 5 * 60;
const LAST_SECONDS = 2 * 60;

const OFFER_SECONDS = WAITLIST_OFFER_MINUTES * 60;

/**
 * Where a held seat stands at `now`: whole seconds left, how urgent that is, and how much
 * of the club's half hour remains. A hold cut short by registration closing starts with
 * less of the ring rather than a full one.
 */
export function readOfferClock(expiresAt: string, now: number) {
  const deadline = new Date(expiresAt).getTime();
  const secondsLeft = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  const urgency: OfferUrgency =
    secondsLeft <= 0 ? "over" : secondsLeft <= LAST_SECONDS ? "last" : secondsLeft <= SOON_SECONDS ? "soon" : "calm";

  return {
    secondsLeft,
    share: Math.min(1, secondsLeft / OFFER_SECONDS),
    urgency,
  };
}

/** "07:05" — minutes and seconds, the way the hall clock reads. */
export function formatOfferClock(secondsLeft: number) {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const TONES: Record<OfferUrgency, { box: string; color: string; speed: string }> = {
  calm: { box: "border-club-mint/40 bg-club-mint/10", color: "#62d49c", speed: "2.4s" },
  soon: { box: "border-club-gold/50 bg-club-gold/10", color: "#e2bc6e", speed: "1.2s" },
  last: { box: "border-club-rose/55 bg-club-crimson/12", color: "#f0647c", speed: "0.8s" },
  over: { box: "border-club-line bg-white/[0.05]", color: "#8a7e7a", speed: "0s" },
};

const RING_RADIUS = 19;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * The seat the queue is holding for this player, counting down.
 *
 * It used to say "держим до 21:30" and leave the sum to the player; a clock running down
 * — amber at five minutes, red at two — says it without arithmetic. The phone counts on
 * its own from the deadline; the club is asked once, when the time is up, to learn where
 * the queue went.
 */
export function OfferCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const clock = readOfferClock(expiresAt, now);
  const over = clock.urgency === "over";
  const tone = TONES[clock.urgency];
  const expired = useRef(false);

  useEffect(() => {
    if (over) return;

    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [over]);

  useEffect(() => {
    if (!over || expired.current) return;

    expired.current = true;
    onExpire();
  }, [onExpire, over]);

  return (
    <div
      className={`relative flex items-center gap-3.5 rounded-[18px] border px-4 py-3.5 transition-colors duration-500 ${tone.box} ${
        over ? "" : "client-breathe"
      }`}
      style={{ "--client-breathe-speed": tone.speed, "--client-glow": tone.color } as CSSProperties}
    >
      <svg aria-hidden className="h-11 w-11 shrink-0 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" fill="none" r={RING_RADIUS} stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
        <circle
          className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear"
          cx="22"
          cy="22"
          fill="none"
          r={RING_RADIUS}
          strokeDasharray={RING_LENGTH}
          strokeLinecap="round"
          strokeWidth="4"
          style={{ stroke: tone.color, strokeDashoffset: RING_LENGTH * (1 - clock.share) }}
        />
      </svg>

      <div className="flex min-w-0 flex-col gap-1 text-left">
        <div className="text-[15px] font-extrabold" style={{ color: over ? "#a99d98" : tone.color }}>
          {over ? "Время вышло" : "Освободилось место — очередь дошла до вас"}
        </div>
        <div className="text-[13px] font-semibold text-club-muted">
          {over ? (
            "Место ушло следующему в очереди."
          ) : (
            <>
              Держим его за вами ещё{" "}
              <b className={`tabular-nums text-club-text ${clock.urgency === "last" ? "client-blink" : ""}`}>
                {formatOfferClock(clock.secondsLeft)}
              </b>
              , до {formatEventTimeLabel(expiresAt)}. Потом место уйдёт следующему в очереди.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
