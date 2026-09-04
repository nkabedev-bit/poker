import { TIER_COLORS, TIER_TITLES, type PlayerTier } from "@/lib/players/tier";

/**
 * The player's tier, spelled out under their name.
 *
 * The card art belongs on the board in the hall, where a row is a hand's width; in a
 * list on a phone it left no room for the name.
 */
export function TierBadge({ tier }: { tier: PlayerTier | null | undefined }) {
  if (!tier) return null;

  return (
    <span
      // Self-start, or the badge stretches to the width of the row it sits in.
      className="mt-0.5 inline-flex w-fit self-start items-center rounded-md border px-1.5 py-px text-[10px] font-bold uppercase leading-[1.4] tracking-wide"
      style={{ borderColor: `${TIER_COLORS[tier]}66`, color: TIER_COLORS[tier] }}
    >
      {tier === "champion" ? <span className="mr-1">👑</span> : null}
      {TIER_TITLES[tier]}
    </span>
  );
}
