import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
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

/** The round badge an award sits in: gold and lit once earned, dashed and locked until then. */
function AwardBadge({ earned, icon }: { earned: boolean; icon: Achievement["icon"] }) {
  return (
    <span
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border ${
        earned
          ? "border-club-gold/50 bg-club-gold/[0.14] text-club-gold"
          : "border-dashed border-club-line bg-club-raised text-club-faint"
      }`}
    >
      {earned ? <AchievementIcon name={icon} size={24} /> : <Lock size={22} strokeWidth={1.8} />}
    </span>
  );
}

const TILE =
  "relative flex h-full flex-col items-center gap-2 overflow-hidden rounded-[20px] border border-club-line bg-club-surface px-2 py-4 text-center";

/**
 * One award, earned or not — the same tile on a player's own screens and on anyone's.
 * A tap opens the players who hold it; the rarity line waits until the club's count has
 * loaded, and the tile stands without it.
 */
export function AchievementCard({
  achievement,
  rarity,
}: {
  achievement: Achievement;
  rarity?: AchievementRarity | null;
}) {
  const shown = Math.min(achievement.value, achievement.goal);
  const share = achievement.goal > 0 ? shown / achievement.goal : 0;

  return (
    <Link
      className={`${TILE} transition-transform active:scale-[0.97] ${achievement.earned ? "client-glint-once" : ""}`}
      href={`/client/achievements/${achievement.id}`}
    >
      <AwardBadge earned={achievement.earned} icon={achievement.icon} />
      <p className={`text-[13px] font-extrabold leading-tight ${achievement.earned ? "" : "text-club-muted"}`}>
        {achievement.title}
      </p>
      <p className="text-[11px] leading-snug text-club-faint">{achievement.description}</p>
      <div className="mt-auto flex w-full flex-col items-center gap-1.5">
        <span className={`text-[11px] font-bold ${achievement.earned ? "text-club-gold" : "text-club-muted"}`}>
          {formatAchievementValue(shown)} / {achievement.goal}
        </span>
        {achievement.earned ? null : (
          <div className="h-[3px] w-16 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-club-gold" style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
        )}
        {rarity ? (
          <div className="text-[10px] leading-snug text-club-faint">
            {formatAchievementRarity(rarity.holders[achievement.id] ?? 0, rarity.players)}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function MedalCard({ medal }: { medal: Medal }) {
  const earned = medal.count > 0;

  return (
    <div className={`${TILE} ${earned ? "client-glint-once" : ""}`}>
      <AwardBadge earned={earned} icon={medal.icon} />
      <p className={`text-[13px] font-extrabold leading-tight ${earned ? "" : "text-club-muted"}`}>{medal.title}</p>
      <p className="text-[11px] leading-snug text-club-faint">{medal.description}</p>
      <span
        className={`mt-auto rounded-full border px-2.5 py-0.5 font-display text-[12px] font-semibold ${
          earned ? "border-club-gold/50 text-club-gold" : "border-club-line text-club-faint"
        }`}
      >
        x{medal.count}
      </span>
    </div>
  );
}

/**
 * The head of a collection screen: a ring filled by the share collected, and the count.
 * `count` is what is drawn in the middle of the line, so a screen may count it up.
 */
export function CollectionSummary({
  count,
  earned,
  hint,
  label,
  total,
}: {
  count?: ReactNode;
  earned: number;
  hint?: ReactNode;
  label: string;
  total: number;
}) {
  const percent = total > 0 ? Math.round((earned / total) * 100) : 0;

  return (
    <div className="flex items-center gap-[18px] rounded-[22px] border border-club-line bg-club-surface p-[18px]">
      <div
        className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full"
        style={{ background: `conic-gradient(#e2bc6e 0 ${percent}%, rgba(255,255,255,0.08) ${percent}% 100%)` }}
      >
        <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-club-surface font-display text-[17px] font-semibold">
          {percent}%
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[12px] text-club-muted">{label}</p>
        <p className="font-display text-[24px] font-semibold">
          {count ?? earned} <span className="text-[15px] text-club-muted">из {total}</span>
        </p>
        {hint ? <div className="mt-1 text-[12px] text-club-faint">{hint}</div> : null}
      </div>
    </div>
  );
}
