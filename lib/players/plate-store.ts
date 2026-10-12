import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";
import { readPlateChoice, type PlateChoice } from "@/lib/players/plates";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/** A plate as the board finds it: the pick and the account it belongs to. */
export type FoundPlate = { accountId: string; choice: PlateChoice };

export type PlateLookup = {
  /** The plate of one player on the roster: by account, then Telegram id, then nickname. */
  find: (player: {
    accountId?: string | null;
    name?: string | null;
    telegramId?: number | null;
  }) => FoundPlate | null;
};

const NO_PLATES: PlateLookup = { find: () => null };

type PlateRow = {
  display_name: string | null;
  id: string;
  plate_color: string | null;
  plate_form: string | null;
  telegram_id: number | null;
};

/**
 * Everybody's plate, for the board in the hall.
 *
 * Only the accounts that picked one are read, so the screen can ask on every refresh and
 * a plate saved a minute ago is drawn on the next one. The columns arrive with a
 * migration applied by hand: until then the read fails and the board draws the tier
 * plates, as before. A plate is decoration — whatever goes wrong, the board goes on.
 */
export async function loadPlayerPlates(supabase: SupabaseClient): Promise<PlateLookup> {
  let rows: PlateRow[];
  try {
    rows = await readAllPages<PlateRow>((from, to) =>
      supabase
        .from("client_bot_users")
        .select("id, telegram_id, display_name, plate_form, plate_color")
        .not("plate_form", "is", null)
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    console.warn("Player plates are unavailable", error);
    return NO_PLATES;
  }

  const byAccount = new Map<string, FoundPlate>();
  const byTelegramId = new Map<number, FoundPlate>();
  const byNickname = new Map<string, FoundPlate>();

  for (const row of rows) {
    const choice = readPlateChoice(row.plate_form, row.plate_color);
    if (!choice) continue;

    const found = { accountId: row.id, choice };
    byAccount.set(row.id, found);
    if (row.telegram_id !== null) byTelegramId.set(Number(row.telegram_id), found);
    const nickname = buildNicknameKey(row.display_name ?? "");
    if (nickname) byNickname.set(nickname, found);
  }

  return {
    find: ({ accountId, name, telegramId }) =>
      (accountId ? byAccount.get(accountId) : undefined) ??
      (telegramId ? byTelegramId.get(Number(telegramId)) : undefined) ??
      byNickname.get(buildNicknameKey(name ?? "")) ??
      null,
  };
}

/** One account's pick, read apart so a missing column never costs the rest of a page. */
export async function readPlayerPlate(
  supabase: SupabaseClient,
  accountId: string,
): Promise<PlateChoice | null> {
  try {
    const { data, error } = await supabase
      .from("client_bot_users")
      .select("plate_form, plate_color")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      console.warn("Player plate is unavailable", error.message);
      return null;
    }

    const row = data as { plate_color?: unknown; plate_form?: unknown } | null;
    return readPlateChoice(row?.plate_form, row?.plate_color);
  } catch (error) {
    console.warn("Player plate is unavailable", error);
    return null;
  }
}
