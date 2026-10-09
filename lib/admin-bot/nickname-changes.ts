import type { SupabaseClient } from "@supabase/supabase-js";

const MOSCOW_TIME_ZONE = "Europe/Moscow";

/** How far back the club looks when it asks who changed a nickname: a month. */
export const NICKNAME_CHANGES_DAYS = 30;

export type NicknameChangeEntry = {
  changedAt: string;
  newName: string;
  oldName: string;
  /** The player's Telegram username, so the desk can tell who it is; null on the web. */
  username: string | null;
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

/** Every nickname players changed themselves in the last month, earliest first. */
export async function readNicknameChanges(
  supabase: SupabaseClient,
  { days = NICKNAME_CHANGES_DAYS, now = new Date() }: { days?: number; now?: Date } = {},
): Promise<NicknameChangeEntry[]> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();

  const { data, error } = await supabase
    .from("nickname_changes")
    .select("old_name, new_name, changed_at, client_bot_users!user_id(username)")
    .gte("changed_at", since)
    .order("changed_at");

  if (error) throw error;

  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const embedded = record.client_bot_users;
    const account = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { username?: unknown }
      | null
      | undefined;
    const username = String(account?.username ?? "").trim();

    return {
      changedAt: String(record.changed_at ?? ""),
      newName: String(record.new_name ?? ""),
      oldName: String(record.old_name ?? ""),
      username: username || null,
    };
  });
}

/** The /changes reply: who became whom, one line a change. */
export function buildNicknameChangesMessage(
  changes: NicknameChangeEntry[],
  days = NICKNAME_CHANGES_DAYS,
) {
  const header = `✏️ Смена ников — за ${days} дн.`;
  if (changes.length === 0) return `${header}\n\nНикто не менял ник.`;

  const lines = changes.map((change) => {
    const at = new Date(change.changedAt);
    const who = change.username ? ` (@${change.username})` : "";
    return `${dayFormat.format(at)} в ${timeFormat.format(at)} — ${change.oldName} → ${change.newName}${who}`;
  });

  return `${header}\n\n${lines.join("\n")}`;
}
