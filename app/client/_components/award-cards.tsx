import Link from "next/link";
import { Users } from "lucide-react";
import { AchievementIcon } from "./achievement-icon";
import {
  formatAchievementRarity,
  type Achievement,
  type AchievementRarity,
} from "@/lib/client/achievements";
import type { Medal } from "@/lib/client/medals";

// Knockout goals are counted in bounty shares, so a half knockout has to stay visible.
export function formatAchievementValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const EARNED =
  "border-[#e9c07a]/45 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] shadow-[0_10px_28px_rgba(233,192,122,0.12)]";
const LOCKED = "border-white/[0.06] bg-white/[0.03]";

/**
 * One award, earned or not — the same card on a player's own screens and on anyone's.
 * A tap opens the players who hold it; the rarity line waits until the club's count has
 * loaded, and the card stands without it.
 */
export function AchievementCard({
  achievement,
  rarity,
}: {
  achievement: Achievement;
  rarity?: AchievementRarity | null;
}) {
  const shown = Math.min(achievement.value, achievement.goal);

  return (
    <Link
      className={`block h-full rounded-[22px] border p-[18px] transition-transform active:scale-[0.98] ${
        achievement.earned ? EARNED : LOCKED
      }`}
      href={`/client/achievements/${achievement.id}`}
    >
      <AchievementIcon
        className={achievement.earned ? "text-[#e9c07a]" : "text-white/30"}
        name={achievement.icon}
      />
      <p
        className={`mt-3 text-[15px] font-bold uppercase leading-tight ${
          achievement.earned ? "text-white" : "text-white/55"
        }`}
      >
        {achievement.title}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-white/35">{achievement.description}</p>
      <span
        className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${
          achievement.earned ? "border-[#e9c07a]/45 text-[#e9c07a]" : "border-white/[0.09] text-white/45"
        }`}
      >
        {formatAchievementValue(shown)} / {achievement.goal}
      </span>
      {/* A div, not a p: the global reset zeroes a paragraph's margin over Tailwind's. */}
      {rarity ? (
        <div className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-white/40">
          <Users aria-hidden className="mt-px shrink-0" size={12} />
          {formatAchievementRarity(rarity.holders[achievement.id] ?? 0, rarity.players)}
        </div>
      ) : null}
    </Link>
  );
}

export function MedalCard({ medal }: { medal: Medal }) {
  const earned = medal.count > 0;

  return (
    <div className={`rounded-[22px] border p-[18px] ${earned ? EARNED : LOCKED}`}>
      <AchievementIcon className={earned ? "text-[#e9c07a]" : "text-white/30"} name={medal.icon} />
      <p
        className={`mt-3 text-[15px] font-bold uppercase leading-tight ${
          earned ? "text-white" : "text-white/55"
        }`}
      >
        {medal.title}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-white/35">{medal.description}</p>
      <span
        className={`mt-3 inline-flex items-center rounded-full border px-3 py-1 text-[12px] font-semibold ${
          earned ? "border-[#e9c07a]/45 text-[#e9c07a]" : "border-white/[0.09] text-white/45"
        }`}
      >
        x{medal.count}
      </span>
    </div>
  );
}
