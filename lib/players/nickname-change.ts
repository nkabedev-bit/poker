import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeClientBotText, startsLikeSheetFormula } from "@/lib/client-bot/registration";
import { buildNicknameKey } from "@/lib/players/nickname-key";

/**
 * How long a new nickname stays before the player may change it again — and how long the
 * old one is shown under it. The database keeps the same number in
 * change_player_nickname (202610090001), which is what actually holds the line.
 */
export const NICKNAME_CHANGE_COOLDOWN_DAYS = 30;

/** The same bounds the questionnaire puts on a nickname. */
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A nickname travels into sheets other than the questionnaire — the knockouts of a game
 * among them — so one that would run as a formula is turned away where it comes in rather
 * than escaped at every write that carries it.
 */
export const SHEET_FORMULA_MESSAGE = "Ник не может начинаться с =, +, - или @.";

const moscowDay = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

/** The nickname a player typed, as the club will store it — or why it cannot be one. */
export function parseNewNickname(value: unknown): { nickname: string } | { message: string } {
  const nickname = normalizeClientBotText(typeof value === "string" ? value : "");

  if (nickname.length < NICKNAME_MIN_LENGTH) {
    return { message: `Ник — не короче ${NICKNAME_MIN_LENGTH} символов.` };
  }
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return { message: `Ник — не длиннее ${NICKNAME_MAX_LENGTH} символов.` };
  }
  if (startsLikeSheetFormula(nickname)) return { message: SHEET_FORMULA_MESSAGE };
  // Without a letter or a digit the nickname has no key, and nothing could find the
  // player's games under it.
  if (!buildNicknameKey(nickname)) {
    return { message: "В нике нужна хотя бы одна буква или цифра." };
  }

  return { nickname };
}

/** "8 ноября" — the day a player may change the nickname again. */
export function formatNicknameChangeDay(iso: string) {
  return moscowDay.format(new Date(iso));
}

/** What the player reads when the club turns a new nickname down. */
export function describeNicknameRefusal(code: string, availableAt?: string | null) {
  switch (code) {
    case "invalid":
      return "В нике нужна хотя бы одна буква или цифра.";
    case "no_profile":
      return "Сначала заполните анкету.";
    case "same":
      return "Это ваш текущий ник.";
    case "cooldown":
      return availableAt
        ? `Ник можно менять раз в ${NICKNAME_CHANGE_COOLDOWN_DAYS} дней. Следующая смена — с ${formatNicknameChangeDay(availableAt)}.`
        : `Ник можно менять раз в ${NICKNAME_CHANGE_COOLDOWN_DAYS} дней.`;
    case "in_game":
      return "Вы в рассадке турнира. Сменить ник можно после его окончания.";
    case "taken":
      return "Этот ник уже занят. Выберите другой.";
    case "conflict":
      return "Не получилось перенести историю игр на новый ник. Напишите администратору клуба.";
    default:
      return "Не удалось сменить ник. Попробуйте ещё раз.";
  }
}

export type NicknameChange = { changedAt: string; oldName: string };

/**
 * The player's latest nickname change, or null when there is none.
 *
 * Also null when the journal cannot be read: until the migration that adds it is applied
 * the profile still opens, it just has nothing to say about a change.
 */
export async function readLastNicknameChange(
  supabase: SupabaseClient,
  accountId: string,
): Promise<NicknameChange | null> {
  const { data, error } = await supabase
    .from("nickname_changes")
    .select("old_name, changed_at")
    .eq("user_id", accountId)
    .order("changed_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("Nickname changes are unavailable", error.message);
    return null;
  }

  const row = (data ?? [])[0] as { changed_at: string; old_name: string } | undefined;
  return row ? { changedAt: row.changed_at, oldName: row.old_name } : null;
}

/** When the player may change the nickname again; null when they already may. */
export function nextNicknameChangeAt(change: NicknameChange | null, now = new Date()) {
  if (!change) return null;

  const at = new Date(change.changedAt).getTime() + NICKNAME_CHANGE_COOLDOWN_DAYS * DAY_MS;
  return at > now.getTime() ? new Date(at).toISOString() : null;
}

/** The nickname the room knew the player by, for as long as the change is fresh. */
export function recentFormerNickname(change: NicknameChange | null, now = new Date()) {
  return change && nextNicknameChangeAt(change, now) ? change.oldName : null;
}
