import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BirthdayAccount } from "@/lib/client-bot/birthdays";
import { readAllPages } from "@/lib/supabase/read-all-pages";

/**
 * Every account the club could wish a happy birthday.
 *
 * Read from the accounts rather than from the spreadsheet: the sheet keeps the club's
 * paper copy, and a date that only lives there is one the app cannot act on. The
 * questionnaires that predate the form in the app were carried across by
 * /api/admin/backfill-profiles.
 */
export async function readBirthdayAccounts(
  supabase: SupabaseClient,
): Promise<BirthdayAccount[]> {
  // A page at a time: past a thousand accounts the rest would have had no birthday.
  return readAllPages<BirthdayAccount>((from, to) =>
    supabase
      .from("client_bot_users")
      .select("display_name, pending_profile_answers")
      .not("display_name", "is", null)
      .not("pending_profile_answers", "is", null)
      .order("id")
      .range(from, to),
  );
}
