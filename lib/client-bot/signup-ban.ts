import type { SupabaseClient } from "@supabase/supabase-js";

const MOSCOW_TIME_ZONE = "Europe/Moscow";

/** How long a player sits out after the club has had enough of the cancellations. */
export const SIGNUP_BAN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

const banDateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: MOSCOW_TIME_ZONE,
});

/** When a ban handed out now runs out. */
export function buildSignupBanUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + SIGNUP_BAN_DAYS * DAY_MS);
}

/** Whether this player is barred from signing up at the moment. */
export function isSignupBanned(bannedUntil: string | null | undefined, now: Date = new Date()) {
  if (!bannedUntil) return false;

  const until = new Date(bannedUntil).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * What the player is told — the club's own wording.
 *
 * Says the date the ban ends and, in the same breath, that they are still welcome to
 * turn up and take a seat from the floor: the club is asking them to stop holding
 * places they do not use, not turning them away.
 */
export function buildSignupBanMessage(bannedUntil: string | Date) {
  const until = bannedUntil instanceof Date ? bannedUntil : new Date(bannedUntil);

  return (
    "Извините, вы часто отменяли запись на игры. " +
    `До ${banDateFormat.format(until)} вы не можете регистрироваться на игры, ` +
    "но будем рады видеть вас в порядке живой очереди"
  );
}

/**
 * Whether this player may sign up, read on its own rather than with the account.
 *
 * Deliberately not part of `ACCOUNT_COLUMNS`: a column named there before its migration
 * is applied makes the whole account read fail, and every player is met with a 403.
 * Here a missing column costs one unenforced ban and nothing else.
 */
export async function readSignupBan(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("signup_banned_until")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;

    const until = (data as { signup_banned_until?: unknown } | null)?.signup_banned_until;
    return typeof until === "string" ? until : null;
  } catch (error) {
    // A ban that cannot be read lets the player through. The other way round — refusing
    // everybody because one column is missing — would close the club's own door.
    console.error("Failed to read the sign-up ban", error);
    return null;
  }
}

/** Hands out a ban, or takes one back when `until` is null. */
export async function setSignupBan(
  supabase: SupabaseClient,
  userId: string,
  until: Date | null,
) {
  const { error } = await supabase
    .from("client_bot_users")
    .update({ signup_banned_until: until ? until.toISOString() : null })
    .eq("id", userId);

  if (error) throw error;
}

/**
 * Writes down one cancellation.
 *
 * Kept apart from the sign-up row because that row does not remember: a player who
 * cancels and signs up again turns it back into a live ticket, and the cancellation
 * would vanish from the count — for exactly the players the club is counting.
 */
export async function recordSignupCancellation(
  supabase: SupabaseClient,
  entry: {
    eventId: string | null;
    eventStartsAt: string | null;
    eventTitle: string;
    userId: string;
  },
) {
  const { error } = await supabase.from("signup_cancellations").insert({
    cancelled_at: new Date().toISOString(),
    event_id: entry.eventId,
    event_starts_at: entry.eventStartsAt,
    event_title: entry.eventTitle,
    user_id: entry.userId,
  });

  if (error) throw error;
}
