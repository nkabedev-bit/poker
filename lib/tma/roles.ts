/**
 * Who may do what at the desk.
 *
 * A floor runs the whole evening: the cash desk, the tournament, the posters and the bot.
 * A dealer works the tables — seats the room and records the knockouts — and nothing
 * else. Shared by the server, which refuses the rest, and the desk, which hides it.
 */
export type TmaRole = "floor" | "dealer";

/**
 * The two people who run the staff. Only they hand out roles and add or remove admins,
 * and they always keep the whole desk: a slip in the bot can never lock them out.
 */
export const ACCESS_MANAGER_IDS: readonly number[] = [511564749, 384428007];

export function isAccessManager(telegramId: number | null | undefined) {
  return typeof telegramId === "number" && ACCESS_MANAGER_IDS.includes(telegramId);
}

/** The role an admin works with. Anything unreadable counts as the narrower one. */
export function readRole(telegramId: number | null | undefined, stored: unknown): TmaRole {
  if (isAccessManager(telegramId)) return "floor";
  return stored === "floor" ? "floor" : "dealer";
}

/** The words the bot accepts for a role, in either language. */
export function parseRoleWord(word: string | undefined): TmaRole | null {
  const value = (word ?? "").trim().toLowerCase();
  if (value === "флор" || value === "floor") return "floor";
  if (value === "дилер" || value === "dealer") return "dealer";
  return null;
}

export const ROLE_LABELS: Record<TmaRole, string> = { dealer: "дилер", floor: "флор" };

/** The room with its sign-ups, and the knockouts: all a dealer's evening needs. */
const DEALER_SCREENS = ["/tma/players", "/tma/signups", "/tma/eliminations"];

export function canOpenScreen(role: TmaRole, pathname: string) {
  if (role === "floor") return true;
  return DEALER_SCREENS.some((screen) => pathname === screen || pathname.startsWith(`${screen}/`));
}
