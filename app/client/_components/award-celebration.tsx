"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { getClientTelegramWebApp } from "../layout";
import { AchievementIcon } from "./achievement-icon";
import { PrimaryButton } from "./ui";
import { useSuitBurst } from "./suit-burst";
import { countWord } from "@/lib/raffle/raffle-scenes";
import { TIER_COLORS, type PlayerTier } from "@/lib/players/tier";
import type { AwardNews, AwardShelf } from "@/lib/client/award-news";

const KICKERS: Record<AwardShelf, string> = {
  achievements: "Новое достижение",
  medals: "Новая медаль",
  tier: "Новый статус",
};

/**
 * An award the player has just won, taking the whole screen for a moment: the medal
 * pops up in front of slow rays, suits go up, the phone buzzes. Several come one after
 * another; the last one is taken with «Забрать».
 */
export function AwardCelebration({
  award,
  left,
  onDone,
}: {
  award: AwardNews;
  /** How many are still to be shown, this one included. */
  left: number;
  onDone: () => void;
}) {
  const { burst, fire } = useSuitBurst(30);
  const awardKey = `${award.shelf}:${award.id}`;
  const tierColor = award.shelf === "tier" ? TIER_COLORS[award.id as PlayerTier] : undefined;

  // Each award gets its own suits and its own buzz as it comes up.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      fire();
      getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [awardKey, fire]);

  // Drawn on the page's body, over the tab bar, which sits in a stacking layer of its own.
  return createPortal(
    <div
      aria-label={KICKERS[award.shelf]}
      aria-modal="true"
      className="client-app fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#050304]/90 px-6 text-center text-white backdrop-blur-sm"
      role="dialog"
    >
      <div key={awardKey} className="relative flex w-full max-w-[340px] flex-col items-center">
        <div
          aria-hidden
          className="client-rays pointer-events-none absolute left-1/2 top-12 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2"
        />
        <div className="client-pop-in relative flex h-24 w-24 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#f9e2a8,#c9973f_72%)] text-[#3a2600] shadow-[0_0_0_7px_rgba(233,192,122,0.14),0_18px_44px_rgba(233,192,122,0.35)]">
          {burst}
          <AchievementIcon name={award.icon} size={44} />
        </div>

        <div
          className="client-rise relative mt-6 text-[11px] font-bold uppercase tracking-[0.22em] text-[#e9c07a]"
          style={{ animationDelay: "250ms" }}
        >
          {KICKERS[award.shelf]}
        </div>
        <div
          className="client-rise relative mt-1.5 text-[24px] font-extrabold uppercase leading-tight"
          style={{ animationDelay: "330ms", color: tierColor }}
        >
          {award.title}
        </div>
        <div
          className="client-rise relative mt-1.5 text-[13px] leading-snug text-white/60"
          style={{ animationDelay: "400ms" }}
        >
          {award.description}
        </div>

        <div className="client-rise relative mt-7 w-full" style={{ animationDelay: "480ms" }}>
          <PrimaryButton onClick={onDone}>{left > 1 ? "Дальше" : "Забрать"}</PrimaryButton>
        </div>
        {left > 1 ? (
          <div className="relative mt-3 text-[12px] text-white/40">
            Ещё {countWord(left - 1, ["награда", "награды", "наград"])}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
