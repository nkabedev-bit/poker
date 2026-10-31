import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InlineKeyboardMarkup } from "grammy/types";
import { getClientBot } from "@/lib/client-bot/broadcast";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  isEventOpenForSeating,
  mapEventRow,
  type TournamentEvent,
} from "@/lib/events/types";
import type { FreeEntryHolder } from "@/lib/free-entries/adjust";
import { countFreePasses, loadPassHolds } from "@/lib/free-entries/holds";
import type { PassSwitchOutcome } from "@/lib/free-entries/switch-pass";

/** What the two buttons under the question send back: pass_offer:yes:<event id>. */
const PASS_OFFER_PREFIX = "pass_offer";

export type PassOfferAnswer = { accept: boolean; eventId: string };

export function buildPassOfferKeyboard(eventId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { callback_data: `${PASS_OFFER_PREFIX}:yes:${eventId}`, text: "Да, по проходке" },
      { callback_data: `${PASS_OFFER_PREFIX}:no:${eventId}`, text: "Нет" },
    ]],
  };
}

/** Null for any other button, so old menus still sitting in chats keep their own path. */
export function parsePassOfferCallback(data: string | undefined): PassOfferAnswer | null {
  const match = /^pass_offer:(yes|no):([\w-]{1,64})$/.exec(data ?? "");
  if (!match) return null;

  return { accept: match[1] === "yes", eventId: match[2] };
}

export function passOfferMessage(event: Pick<TournamentEvent, "startsAt" | "title">) {
  return (
    "🎟 У вас есть бесплатная проходка.\n\n" +
    "Хотите использовать её на следующем турнире, на который вы записаны — " +
    `«${event.title}», ${formatEventDayLabel(event.startsAt)} в ${formatEventTimeLabel(event.startsAt)}?`
  );
}

export function passOfferAnswerText(answer: PassOfferAnswer, outcome: PassSwitchOutcome | null) {
  if (!answer.accept) {
    return "Хорошо, билет остался обычным, а проходка — на вашем аккаунте. Выбрать для неё игру можно в афише.";
  }
  if (!outcome) return "Не нашли ваш аккаунт. Откройте приложение и смените билет в афише.";
  if (!outcome.ok) return `${outcome.message}\n\nСменить билет можно в афише.`;

  return (
    `Готово! Запись на «${outcome.event.title}» (${formatEventDayLabel(outcome.event.startsAt)}) теперь по проходке. ` +
    "Вернуть обычный билет можно в афише."
  );
}

/**
 * The nearest game the player holds a regular ticket to and pays for at the door.
 *
 * Tonight's game counts while its evening lasts: a player signed up but not yet seated
 * can still walk in on a pass.
 */
async function findNextPaidSignup(
  supabase: SupabaseClient,
  userId: string,
  now: Date,
): Promise<TournamentEvent | null> {
  const { data, error } = await supabase
    .from("event_signups")
    .select("tournament_events(id, title, starts_at, late_entry_until, is_published)")
    .eq("user_id", userId)
    .eq("status", "signed_up")
    .eq("ticket_type", "regular")
    .eq("use_pass", "none");

  if (error) throw error;

  const events = (data ?? []).flatMap((row) => {
    const embedded = (row as Record<string, unknown>).tournament_events;
    // PostgREST hands a to-one embed back as an object, older versions as an array.
    const eventRow = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | Record<string, unknown>
      | undefined;
    if (!eventRow) return [];

    const event = mapEventRow(eventRow);
    return event.isPublished && isEventOpenForSeating(event, now) ? [event] : [];
  });

  events.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return events[0] ?? null;
}

/**
 * Asks a player who just got a pass whether their next game should be paid with it.
 *
 * Posters fill up minutes after they go out on Monday, so a pass won later in the week
 * would otherwise sit unused: the only way to put it on a game already full was to give
 * the seat back. Asked about one game only — the nearest; the rest are switched in the
 * app. Nothing is asked when no pass is left free or no game is paid for at the door.
 *
 * Never throws: the pass is already on the account, and a question that fails to arrive
 * takes nothing from it.
 */
export async function offerPassForNextSignup(
  supabase: SupabaseClient,
  holder: FreeEntryHolder,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const bot = getClientBot();
    if (!bot) return false;

    const by = holder.accountId
      ? { column: "id", value: holder.accountId as string | number }
      : holder.telegramId != null
        ? { column: "telegram_id", value: holder.telegramId as string | number }
        : null;
    if (!by) return false;

    const { data: account, error } = await supabase
      .from("client_bot_users")
      .select("id, chat_id, free_entries")
      .eq(by.column, by.value)
      .maybeSingle();

    if (error) throw error;

    const row = account as { chat_id?: unknown; free_entries?: number | null; id?: string } | null;
    const chatId = Number(row?.chat_id);
    if (!row?.id || !Number.isFinite(chatId) || chatId === 0) return false;

    const passes = countFreePasses(row, await loadPassHolds(supabase, row.id, now));
    if (passes.regular <= 0) return false;

    const event = await findNextPaidSignup(supabase, row.id, now);
    if (!event) return false;

    await bot.api.sendMessage(chatId, passOfferMessage(event), {
      reply_markup: buildPassOfferKeyboard(event.id),
    });
    return true;
  } catch (error) {
    console.error("Failed to offer the pass for the next game", { holder, error });
    return false;
  }
}
