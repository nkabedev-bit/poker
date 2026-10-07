import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AttachOutcome =
  | { accountId: string; error: null }
  | { accountId: null; error: "account_gone" | "other_yandex" | "yandex_taken" };

type Row = { id: string; profile_submitted_at: string | null; telegram_id: number | null; yandex_id: string | null };

/**
 * Gives a club profile a Yandex sign-in, keeping its Telegram one.
 *
 * The profile is the one the player's own mini-app vouched for (a link pass), so nothing
 * has to be proved here — only kept from going wrong:
 * - a profile already signed into with another Yandex account stays with it;
 * - this Yandex account may already have an empty web account of its own, made by an
 *   earlier visit that never got past the sign-in — that one is dropped, as /api/auth/link
 *   does, since it holds nothing;
 * - a Yandex account that already carries a real club profile is not moved: two
 *   profiles for one person are for the club to sort out, not a link to guess at.
 */
export async function attachYandexToAccount(
  supabase: SupabaseClient,
  { accountId, email, yandexId }: { accountId: string; email: string | null; yandexId: string },
): Promise<AttachOutcome> {
  const { data: target, error: targetError } = await supabase
    .from("client_bot_users")
    .select("id, yandex_id, telegram_id, profile_submitted_at")
    .eq("id", accountId)
    .maybeSingle();

  if (targetError) throw targetError;
  if (!target) return { accountId: null, error: "account_gone" };

  const profile = target as Row;
  if (profile.yandex_id === yandexId) return { accountId: profile.id, error: null };
  if (profile.yandex_id) return { accountId: null, error: "other_yandex" };

  const { data: holder, error: holderError } = await supabase
    .from("client_bot_users")
    .select("id, yandex_id, telegram_id, profile_submitted_at")
    .eq("yandex_id", yandexId)
    .maybeSingle();

  if (holderError) throw holderError;

  if (holder) {
    const other = holder as Row;
    if (other.profile_submitted_at || other.telegram_id) return { accountId: null, error: "yandex_taken" };

    // One account per Yandex id: the empty one goes before the profile takes the id.
    const { error: dropError } = await supabase.from("client_bot_users").delete().eq("id", other.id);
    if (dropError) throw dropError;
  }

  const { error: moveError } = await supabase
    .from("client_bot_users")
    .update(email ? { email, yandex_id: yandexId } : { yandex_id: yandexId })
    .eq("id", profile.id);

  if (moveError) throw moveError;
  return { accountId: profile.id, error: null };
}
