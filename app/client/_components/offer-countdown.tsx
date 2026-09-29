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
  calm: { box: "border-emerald-400/40 bg-emerald-400/10", color: "#34d399", speed: "2.4s" },
  soon: { box: "border-[#f5b041]/50 bg-[#f5b041]/10", color: "#f5b041", speed: "1.2s" },
  last: { box: "border-[#f05a7e]/55 bg-[#f05a7e]/12", color: "#f05a7e", speed: "0.8s" },
  over: { box: "border-white/15 bg-white/[0.06]", color: "rgba(255,255,255,0.35)", speed: "0s" },
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
      className={`relative flex items-center gap-3.5 rounded-2xl border px-4 py-3.5 transition-colors duration-500 ${tone.box} ${
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

      <div className="min-w-0 text-left">
        <div className="text-[15px] font-bold" style={{ color: over ? "rgba(255,255,255,0.7)" : tone.color }}>
          {over ? "Время вышло" : "Освободилось место — очередь дошла до вас"}
        </div>
        <div className="mt-1 text-[13px] font-semibold text-white/60">
          {over ? (
            "Место ушло следующему в очереди."
          ) : (
            <>
              Держим его за вами ещё{" "}
              <b className={`tabular-nums text-white ${clock.urgency === "last" ? "client-blink" : ""}`}>
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
