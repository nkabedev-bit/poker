import { AchievementIcon } from "./achievement-icon";
import type { Achievement } from "@/lib/client/achievements";
import type { Medal } from "@/lib/client/medals";

// Knockout goals are counted in bounty shares, so a half knockout has to stay visible.
function formatValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

const EARNED =
  "border-[#e9c07a]/45 bg-[linear-gradient(180deg,rgba(233,192,122,0.16),rgba(233,192,122,0.02))] shadow-[0_10px_28px_rgba(233,192,122,0.12)]";
const LOCKED = "border-white/[0.06] bg-white/[0.03]";

/** One award, earned or not — the same card on a player's own screens and on anyone's. */
export function AchievementCard({ achievement }: { achievement: Achievement }) {
  const shown = Math.min(achievement.value, achievement.goal);

  return (
    <div className={`rounded-[22px] border p-[18px] ${achievement.earned ? EARNED : LOCKED}`}>
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
        {formatValue(shown)} / {achievement.goal}
      </span>
    </div>
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
