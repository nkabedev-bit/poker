import type { ReactNode } from "react";
import { TIER_TITLES, type PlayerTier } from "@/lib/players/tier";

/**
 * The player's club card: the club's name, their tier, their face and their name, on
 * the burgundy of the club's own cards.
 */
export function ClubCard({
  avatar,
  name,
  subtitle,
  tier,
}: {
  /** The face, passed in so the profile can make it the button that changes the photo. */
  avatar: ReactNode;
  name: string;
  subtitle: string;
  tier: PlayerTier | null;
}) {
  return (
    <div className="relative h-[226px] overflow-hidden rounded-3xl border border-club-rose/35 bg-[#4e0c1e] shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.035)_0_2px,rgba(255,255,255,0)_2px_9px)]"
      />
      <span aria-hidden className="absolute -right-5 -top-[52px] text-[250px] leading-none text-white/[0.07]">
        ♠
      </span>

      <div className="absolute left-5 top-[18px] flex flex-col gap-1">
        <span className="font-display text-[17px] font-bold tracking-[0.3em] text-club-gold">MAJESTIC</span>
        <span className="text-[9px] font-bold tracking-[0.22em] text-club-text/60">КЛУБ СПОРТИВНОГО ПОКЕРА</span>
      </div>

      {tier ? (
        <span className="absolute right-[18px] top-[18px] rounded-lg border border-club-gold/60 px-2 py-1 text-[11px] font-extrabold tracking-[0.1em] text-club-gold">
          {TIER_TITLES[tier]}
        </span>
      ) : null}

      <div className="absolute inset-x-5 bottom-[18px] flex items-center gap-3.5">
        {avatar}
        <div className="flex min-w-0 flex-1 flex-col gap-1 pl-1">
          <p className="truncate font-display text-[20px] font-bold uppercase tracking-[0.02em]">{name}</p>
          <p className="truncate text-[13px] text-club-text/70">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
