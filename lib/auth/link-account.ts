import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNicknameKey } from "@/lib/players/nickname-key";

/**
 * Claiming the profile a returning player already has.
 *
 * The nickname is the whole of it, by the club owner's decision: a player says who they
 * are and the profile is handed over. Nothing here proves the claim — nicknames are on
 * the public rating for anyone to read — so the club watches for this the way it
 * watches the door.
 *
 * What is still refused: a profile another Yandex account already claimed, and a
 * nickname two players share, which cannot be told apart by the one thing being asked.
 */
export type LinkOutcome =
  | { error: "already_linked" | "not_found"; account: null }
  | { error: null; account: { id: string } };

export async function linkExistingAccount(
  supabase: SupabaseClient,
  { newAccountId, nickname }: { newAccountId: string; nickname: string },
): Promise<LinkOutcome> {
  const key = buildNicknameKey(nickname);
  if (!key) return { error: "not_found", account: null };

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, yandex_id")
    .eq("nickname_key", key)
    .neq("id", newAccountId)
    .limit(2);

  if (error) throw error;

  const matches = (data ?? []) as Array<{ id: string; yandex_id: string | null }>;

  // Two accounts under one nickname cannot be told apart by it, and handing over the
  // wrong history is worse than handing over none.
  if (matches.length !== 1) return { error: "not_found", account: null };

  const existing = matches[0];
  if (existing.yandex_id) return { error: "already_linked", account: null };

  return { error: null, account: { id: existing.id } };
}
