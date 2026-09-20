/** A face on the knockout banner: how the room knows this player, and what they look like. */
export type KnockoutFace = {
  avatarUrl: string | null;
  name: string;
};

/**
 * What the hall is told when somebody goes out.
 *
 * Stored rather than worked out from the roster on the screen: a re-entry leaves the
 * player exactly as they were — same seat, same status — so nothing in a later copy of
 * the roster says it happened, and two knockouts between two refreshes would show as
 * one. The banner is written down at the moment it happens, and the screen plays what
 * it has not played yet.
 */
export type KnockoutBanner = {
  /** The players credited with it; empty in a game where the club records no killers. */
  killers: KnockoutFace[];
  id: string;
  /** Where they finished; null when they bought back in. */
  place: number | null;
  player: KnockoutFace;
  recordedAt: string;
  /** A re-entry, and whether it was the double one. Null when they are out for good. */
  reentry: { double: boolean } | null;
};

/** How many banners the club keeps, so a burst at the final table is not lost. */
export const KNOCKOUT_BANNER_HISTORY = 6;

/** How long each banner holds the screen. */
export const KNOCKOUT_BANNER_SECONDS = 5;

/**
 * How stale a banner can be and still be shown.
 *
 * A screen that reloads — or reconnects after the hall's wifi drops — reads whatever
 * the club wrote down last, and must not replay a knockout the room watched ten minutes
 * ago. Wide enough to cover the gap between a knockout and the screen's next pulse.
 */
export const KNOCKOUT_BANNER_FRESH_MS = 30_000;

function face(name: unknown, avatarUrl: unknown): KnockoutFace {
  return {
    avatarUrl: typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl : null,
    name: String(name ?? "").trim() || "Игрок",
  };
}

/** A banner as far as anything can tell from stored JSON. */
export function isKnockoutBanner(value: unknown): value is KnockoutBanner {
  if (!value || typeof value !== "object") return false;

  const banner = value as Partial<KnockoutBanner>;
  return (
    typeof banner.id === "string" &&
    typeof banner.recordedAt === "string" &&
    typeof banner.player === "object" &&
    banner.player !== null &&
    typeof (banner.player as KnockoutFace).name === "string" &&
    Array.isArray(banner.killers)
  );
}

/**
 * The banner for one knockout.
 *
 * `place` and `reentry` are the two ends of the same question — a player who bought
 * back in took no place — so a re-entry never carries one.
 */
export function buildKnockoutBanner({
  findAvatar,
  id = crypto.randomUUID(),
  killers = [],
  place,
  playerName,
  recordedAt = new Date().toISOString(),
  reentryDouble = false,
  usesReentry = false,
}: {
  findAvatar?: (player: { name: string; telegramId?: number | null }) => string | null;
  id?: string;
  killers?: Array<{ name: string; telegramId?: number | null }>;
  place?: number | null;
  playerName: string;
  recordedAt?: string;
  reentryDouble?: boolean;
  usesReentry?: boolean;
}): KnockoutBanner {
  const avatarOf = (player: { name: string; telegramId?: number | null }) =>
    findAvatar?.(player) ?? null;

  return {
    id,
    killers: killers
      // A killer the club could not name is no killer: the line would read "выбил Игрок".
      .filter((killer) => String(killer.name ?? "").trim())
      .map((killer) => face(killer.name, avatarOf(killer))),
    place: usesReentry ? null : (Number.isInteger(Number(place)) && Number(place) > 0 ? Number(place) : null),
    player: face(playerName, avatarOf({ name: playerName })),
    recordedAt,
    reentry: usesReentry ? { double: Boolean(reentryDouble) } : null,
  };
}

/** The line under the names: what became of the player who went out. */
export function describeKnockoutOutcome(banner: KnockoutBanner) {
  if (banner.reentry) {
    return banner.reentry.double ? "использует ре-энтри x2" : "использует ре-энтри";
  }

  return banner.place ? `${banner.place} место` : "выбывает";
}

/**
 * The banners this screen has not shown yet.
 *
 * Asked of every refresh: the club keeps the last few knockouts, and the screen plays
 * the ones it has not seen, oldest first, so a double knockout is announced twice
 * rather than once. Anything older than the freshness window belongs to a game the room
 * has already watched — a screen that reloads mid-evening must not replay it.
 */
export function selectKnockoutsToPlay(
  banners: KnockoutBanner[],
  shown: ReadonlySet<string>,
  now: Date = new Date(),
): KnockoutBanner[] {
  return banners
    .filter((banner) => {
      if (shown.has(banner.id)) return false;

      const recordedAt = new Date(banner.recordedAt).getTime();
      if (!Number.isFinite(recordedAt)) return false;

      return now.getTime() - recordedAt < KNOCKOUT_BANNER_FRESH_MS;
    })
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
}
