"use client";

import Link from "next/link";
import { House, MessageSquare, Star, Swords, Trophy, User } from "lucide-react";
import { TIER_COLORS, TIER_TITLES, type PlayerTier } from "@/lib/players/tier";
import { PlayerAvatar } from "./player-avatar";

export type SideNavPlayer = {
  hand?: string | null;
  name: string;
  photoUrl?: string;
  tier?: PlayerTier | null;
};

const PROFILE_SCREENS = ["/profile", "/achievements", "/medals", "/passes", "/games"];

// A computer has room for the rating as a section of its own; on a phone it stays a
// screen opened from the home page and the profile.
const SECTIONS = [
  {
    href: "/client",
    icon: House,
    label: "Главная",
    match: (p: string) => p === "/client" || p.includes("/news") || p.includes("/about") || p.includes("/link") || p.includes("/onboarding"),
  },
  { href: "/client/tournaments", icon: Trophy, label: "Турниры", match: (p: string) => p.includes("/tournaments") || p.includes("/events") },
  { href: "/client/rating", icon: Star, label: "Рейтинг", match: (p: string) => p.includes("/rating") || p.includes("/players") },
  { href: "/client/battle-pass", icon: Swords, label: "Боевой пропуск", match: (p: string) => p.includes("/battle-pass") },
  { href: "/client/profile", icon: User, label: "Профиль", match: (p: string) => PROFILE_SCREENS.some((screen) => p.includes(screen)) },
];

/**
 * The menu down the left of a wide screen, in place of the phone's tab bar: a rail of
 * icons on a tablet or a narrow laptop, icons with their names from 1200px.
 */
export function ClientSideNav({
  onSupport,
  pathname,
  player,
}: {
  onSupport: () => void;
  pathname: string;
  player: SideNavPlayer | null;
}) {
  return (
    <aside className="hidden w-[84px] shrink-0 flex-col items-center gap-7 overflow-y-auto border-r border-club-line bg-[#110c0e] py-7 md:flex desk:w-64 desk:items-stretch desk:gap-8 desk:px-5 desk:py-8">
      <Link aria-label="Majestic — главная" className="flex flex-col gap-1.5 desk:px-3.5" href="/client">
        <span className="font-display text-[22px] font-bold text-club-gold desk:hidden">M</span>
        <span className="hidden font-display text-[18px] font-bold tracking-[0.3em] text-club-gold desk:inline">
          MAJESTIC
        </span>
        <span className="hidden text-[10px] font-bold tracking-[0.18em] text-club-faint desk:inline">
          КЛУБ СПОРТИВНОГО ПОКЕРА
        </span>
      </Link>

      <nav aria-label="Разделы" className="flex flex-col gap-1.5 desk:gap-1">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = section.match(pathname);

          return (
            <Link
              key={section.href}
              aria-current={active ? "page" : undefined}
              aria-label={section.label}
              className={`flex h-[52px] w-[52px] items-center justify-center gap-3.5 rounded-2xl transition-colors desk:h-12 desk:w-auto desk:justify-start desk:rounded-[14px] desk:px-3.5 ${
                active
                  ? "bg-club-crimson/16 text-club-text"
                  : "text-club-muted hover:bg-white/[0.04] hover:text-club-text"
              }`}
              href={section.href}
            >
              <Icon className={active ? "text-club-rose" : "text-club-faint"} size={21} strokeWidth={active ? 2.1 : 1.8} />
              <span className={`hidden text-[15px] desk:inline ${active ? "font-extrabold" : "font-semibold"}`}>
                {section.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2.5 desk:items-stretch">
        <button
          aria-label="Поддержка"
          className="flex h-11 w-11 items-center justify-center gap-3 rounded-[14px] text-[14px] font-semibold text-club-muted transition-colors hover:bg-white/[0.04] hover:text-club-text desk:w-auto desk:justify-start desk:px-3.5"
          type="button"
          onClick={onSupport}
        >
          <MessageSquare className="shrink-0 text-club-rose" size={19} strokeWidth={1.8} />
          <span className="hidden desk:inline">Поддержка</span>
        </button>

        {player ? (
          <Link
            aria-label="Профиль"
            className="flex items-center gap-3 rounded-[18px] desk:border desk:border-club-line desk:bg-club-surface desk:p-3"
            href="/client/profile"
          >
            <PlayerAvatar hand={player.hand} name={player.name} photoUrl={player.photoUrl} size={40} />
            <div className="hidden min-w-0 flex-col pl-1 desk:flex">
              <p className="truncate text-[14px] font-extrabold">{player.name}</p>
              {player.tier ? (
                <p className="text-[11px] font-extrabold tracking-[0.08em]" style={{ color: TIER_COLORS[player.tier] }}>
                  {TIER_TITLES[player.tier]}
                </p>
              ) : null}
            </div>
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
