import type { SupabaseClient } from "@supabase/supabase-js";

const MOSCOW_TIME_ZONE = "Europe/Moscow";

/** How far back the club looks when it asks who dropped out. */
export const CANCELLED_SIGNUP_DAYS = 5;

export type CancelledSignup = {
  /** When the player tapped "отменить", as the row was last written. */
  cancelledAt: string;
  eventStartsAt: string;
  eventTitle: string;
  nickname: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: MOSCOW_TIME_ZONE,
});

const timeFormat = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: MOSCOW_TIME_ZONE,
});

function firstEmbedded<T>(value: unknown): T | undefined {
  return (Array.isArray(value) ? value[0] : value) as T | undefined;
}

function mapRow(row: Record<string, unknown>): CancelledSignup | null {
  const event = firstEmbedded<{ title?: unknown; starts_at?: unknown }>(row.tournament_events);
  const account = firstEmbedded<{ display_name?: unknown }>(row.client_bot_users);

  const eventStartsAt = String(event?.starts_at ?? "");
  const cancelledAt = String(row.updated_at ?? "");
  if (!eventStartsAt || !cancelledAt) return null;

  return {
    cancelledAt,
    eventStartsAt,
    eventTitle: String(event?.title ?? "").trim() || "Турнир",
    // A player who filled in no nickname is still somebody the club lost a seat to.
    nickname: String(account?.display_name ?? "").trim() || "Без ника",
  };
}

/**
 * Who cancelled a sign-up in the last few days.
 *
 * The moment of the cancellation is `updated_at`: the row is written once when the
 * player drops out, and nothing touches a cancelled sign-up afterwards — signing up
 * again sets the status back to `signed_up`, so it leaves this list rather than lying
 * about a cancellation that was taken back.
 */
export async function readCancelledSignups(
  supabase: SupabaseClient,
  { days = CANCELLED_SIGNUP_DAYS, now = new Date() }: { days?: number; now?: Date } = {},
): Promise<CancelledSignup[]> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();

  // The foreign keys are named because several columns of the row point at
  // client_bot_users, and an unnamed embed is ambiguous.
  const { data, error } = await supabase
    .from("event_signups")
    .select(
      "updated_at, client_bot_users!user_id(display_name), tournament_events!event_id(title, starts_at)",
    )
    .eq("status", "cancelled")
    .gte("updated_at", since)
    .order("updated_at");

  if (error) throw error;

  return (data ?? [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .filter((signup): signup is CancelledSignup => signup !== null);
}

type CancelledGroup = {
  eventStartsAt: string;
  eventTitle: string;
  signups: CancelledSignup[];
};

/** One block per evening, earliest game first, and inside it the cancellations in order. */
export function groupCancelledSignups(signups: CancelledSignup[]): CancelledGroup[] {
  const groups = new Map<string, CancelledGroup>();

  for (const signup of signups) {
    const key = `${signup.eventStartsAt}|${signup.eventTitle}`;
    const group = groups.get(key);

    if (group) {
      group.signups.push(signup);
      continue;
    }

    groups.set(key, {
      eventStartsAt: signup.eventStartsAt,
      eventTitle: signup.eventTitle,
      signups: [signup],
    });
  }

  return [...groups.values()]
    .sort((a, b) => new Date(a.eventStartsAt).getTime() - new Date(b.eventStartsAt).getTime())
    .map((group) => ({
      ...group,
      signups: [...group.signups].sort(
        (a, b) => new Date(a.cancelledAt).getTime() - new Date(b.cancelledAt).getTime(),
      ),
    }));
}

/** The /cancel reply: who dropped out, under the evening they were going to play. */
export function buildCancelledSignupsMessage(
  signups: CancelledSignup[],
  days = CANCELLED_SIGNUP_DAYS,
) {
  const header = `🚫 Отмены записей — за ${days} дн.`;
  if (signups.length === 0) {
    return `${header}\n\nНикто не отменял запись.`;
  }

  const blocks = groupCancelledSignups(signups).map((group) => {
    const lines = group.signups.map((signup) => {
      const cancelled = new Date(signup.cancelledAt);
      return `${signup.nickname} — ${dayFormat.format(cancelled)} в ${timeFormat.format(cancelled)}`;
    });

    const day = dayFormat.format(new Date(group.eventStartsAt));

    return `${day} ${group.eventTitle} отменили:\n${lines.join("\n")}`;
  });

  return `${header}\n\n${blocks.join("\n\n")}`;
}
