import { buildNicknameKey } from "@/lib/players/nickname-key";

export type PlayerTier = "member" | "core" | "legend" | "champion";

/** How many games the club counts before a player moves up. */
export const TIER_GAMES = { core: 20, legend: 50, member: 5 } as const;

export const TIER_TITLES: Record<PlayerTier, string> = {
  champion: "CHAMPION",
  core: "CORE",
  legend: "LEGEND",
  member: "MEMBER",
};

/** The accent of each tier — the colour of its card, used for text and edges. */
export const TIER_COLORS: Record<PlayerTier, string> = {
  champion: "#e9c07a",
  core: "#e0384f",
  legend: "#a855f7",
  member: "#e0384f",
};

/**
 * The class that dresses a row in its tier, the way the club's cards are printed: the
 * plate behind the name is coloured, not the name itself. Member is a black card with a
 * red edge, core a red one, legend purple with a gem, champion gold with a crown.
 *
 * The look lives in globals.css (`.tier-plate`), so the board, the rating and a game's
 * table all wear the same one.
 */
export const TIER_PLATE_CLASS: Record<PlayerTier, string> = {
  champion: "tier-plate tier-plate--champion",
  core: "tier-plate tier-plate--core",
  legend: "tier-plate tier-plate--legend",
  member: "tier-plate tier-plate--member",
};

/** The mark a tier carries at the right edge of its plate; the lesser tiers have none. */
export const TIER_MARK: Partial<Record<PlayerTier, string>> = {
  champion: "👑",
  legend: "◆",
};

const TIER_LABELS = new Map<string, PlayerTier>([
  ["member", "member"],
  ["мембер", "member"],
  ["core", "core"],
  ["кор", "core"],
  ["legend", "legend"],
  ["легенда", "legend"],
  ["champion", "champion"],
  ["чемпион", "champion"],
]);

/** A label an admin typed that names a tier rather than describing something else. */
export function readTierLabel(label: string | null | undefined): PlayerTier | null {
  return TIER_LABELS.get(buildNicknameKey(String(label ?? ""))) ?? null;
}

/**
 * The tier a player has earned by turning up: five games make a member, twenty a core
 * player, fifty a legend. Champion is never earned this way — the club hands it out.
 */
export function getTierFromGames(games: number): PlayerTier | null {
  const played = Math.max(0, Math.trunc(Number(games) || 0));

  if (played >= TIER_GAMES.legend) return "legend";
  if (played >= TIER_GAMES.core) return "core";
  if (played >= TIER_GAMES.member) return "member";

  return null;
}

/**
 * What to show beside a player's name.
 *
 * The count decides it on its own, and a label the admin typed wins — that is how a
 * champion is crowned, and how an exception is made without touching the history.
 */
export function resolvePlayerTier({
  games,
  label,
}: {
  games?: number | null;
  label?: string | null;
}): PlayerTier | null {
  return readTierLabel(label) ?? getTierFromGames(Number(games ?? 0));
}
