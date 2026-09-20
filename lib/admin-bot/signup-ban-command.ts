import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { findClientBotUserByNickname } from "@/lib/client-bot/nickname-match";
import { getEvent, getUserSignupsWithEvents } from "@/lib/events/store";
import { offerFreedSeats } from "@/lib/events/waitlist-offers";
import { isUpcomingEvent } from "@/lib/events/types";
import {
  buildSignupBanMessage,
  buildSignupBanUntil,
  SIGNUP_BAN_DAYS,
  setSignupBan,
} from "@/lib/client-bot/signup-ban";

/** The nickname the admin typed after the command, or null when they typed none. */
export function parseBanCommand(text: string): string | null {
  const match = text.match(/^\/(?:un)?ban(?:@\S+)?\s+(.+)$/i);
  const nickname = match?.[1]?.trim() ?? "";

  return nickname || null;
}

type BanOutcome =
  | { error: string; ok: false }
  | { displayName: string; freedSeats: number; ok: true; until: Date };

/**
 * Bars a player from signing up for a week.
 *
 * Their seats go back at the same moment. A ban that left them standing would hold the
 * very place the club is banning them for holding, and the queue behind it would wait
 * on a player who is not coming — so every ticket still ahead of them is given up and
 * offered on.
 */
export async function banPlayerSignups(
  supabase: SupabaseClient,
  nickname: string,
  now: Date = new Date(),
): Promise<BanOutcome> {
  const match = await findClientBotUserByNickname(supabase, nickname);

  if (match.ambiguous) {
    return { error: `Ник «${nickname}» встречается у нескольких игроков — уточните.`, ok: false };
  }
  if (!match.user) {
    return { error: `Игрок «${nickname}» не найден среди анкет.`, ok: false };
  }

  const until = buildSignupBanUntil(now);
  await setSignupBan(supabase, match.user.id, until);

  const freedSeats = await releaseUpcomingSignups(supabase, match.user.id, now);

  // Told in the bot as well as on their screen: a player who has stopped opening the
  // app is exactly the one who would otherwise find out by being turned away.
  await notifyClientUser(supabase, match.user.id, buildSignupBanMessage(until));

  return { displayName: match.user.displayName, freedSeats, ok: true, until };
}

/** Gives up every ticket this player still holds for a game that has not been played. */
async function releaseUpcomingSignups(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<number> {
  const mine = await getUserSignupsWithEvents(supabase, userId);
  const ahead = mine.filter((item) => isUpcomingEvent(item.event, now));
  let freed = 0;

  for (const item of ahead) {
    const { error } = await supabase
      .from("event_signups")
      .update({ status: "cancelled" })
      .eq("event_id", item.event.id)
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to release a banned player's seat", error);
      continue;
    }

    freed += 1;

    // The seat is free now, and the queue moves by one.
    try {
      const event = await getEvent(supabase, item.event.id);
      if (event) await offerFreedSeats(supabase, event);
    } catch (offerError) {
      console.error("Failed to offer the freed seat on", offerError);
    }
  }

  return freed;
}

/** Lets a player sign up again before their week is out. */
export async function unbanPlayerSignups(
  supabase: SupabaseClient,
  nickname: string,
): Promise<{ displayName: string; ok: true } | { error: string; ok: false }> {
  const match = await findClientBotUserByNickname(supabase, nickname);

  if (match.ambiguous) {
    return { error: `Ник «${nickname}» встречается у нескольких игроков — уточните.`, ok: false };
  }
  if (!match.user) {
    return { error: `Игрок «${nickname}» не найден среди анкет.`, ok: false };
  }

  await setSignupBan(supabase, match.user.id, null);
  await notifyClientUser(
    supabase,
    match.user.id,
    "Запрет на запись снят — записывайтесь на игры как обычно.",
  );

  return { displayName: match.user.displayName, ok: true };
}

/** What the admin is told once the ban stands. */
export function buildBanReply(outcome: Extract<BanOutcome, { ok: true }>) {
  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(outcome.until);

  const seats =
    outcome.freedSeats > 0
      ? `\nСняли с ближайших игр: ${outcome.freedSeats}. Места ушли в лист ожидания.`
      : "";

  return (
    `«${outcome.displayName}» не может записываться на игры ${SIGNUP_BAN_DAYS} дней — до ${date}.` +
    `${seats}\nИгроку написали в бот. Живая очередь по-прежнему доступна.`
  );
}
