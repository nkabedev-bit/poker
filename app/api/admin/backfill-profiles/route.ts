import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readClientBotProfileSheet } from "@/lib/google-sheets";
import { readSheetProfiles } from "@/lib/client-bot/profile-backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Carries the old questionnaires from the spreadsheet into the accounts.
 *
 * The form used to be a conversation in the bot, and its answers went straight to the
 * sheet — the account row learned nothing. So a player whose questionnaire is plainly
 * there was told the club had no date of birth for them, and could not claim their own
 * profile on the web.
 *
 * Only fills what is missing: an account that answered the questionnaire in the app
 * already holds the fuller version, year and all, and is left alone.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const profiles = readSheetProfiles(await readClientBotProfileSheet());

  if (profiles.length === 0) {
    return NextResponse.json({ error: "Лист «анкеты» пуст или недоступен" }, { status: 502 });
  }

  const { data, error } = await supabase
    .from("client_bot_users")
    .select("id, nickname_key, pending_profile_answers")
    .not("nickname_key", "is", null);

  if (error) throw error;

  const accounts = (data ?? []) as Array<{
    id: string;
    nickname_key: string | null;
    pending_profile_answers: Record<string, unknown> | null;
  }>;

  const byKey = new Map(profiles.map((profile) => [profile.nicknameKey, profile]));
  let filled = 0;
  let alreadyHad = 0;

  for (const account of accounts) {
    const profile = account.nickname_key ? byKey.get(account.nickname_key) : undefined;
    if (!profile) continue;

    const answers = account.pending_profile_answers ?? {};
    if (String(answers.birthDate ?? "").trim()) {
      alreadyHad += 1;
      continue;
    }

    const { error: writeError } = await supabase
      .from("client_bot_users")
      .update({
        pending_profile_answers: {
          ...answers,
          birthDate: profile.birthDate,
          fullName: answers.fullName ?? profile.fullName,
          phone: answers.phone ?? profile.phone,
        },
      })
      .eq("id", account.id);

    if (writeError) {
      console.error("Could not carry a questionnaire over", account.id, writeError);
      continue;
    }

    filled += 1;
  }

  return NextResponse.json({
    accounts: accounts.length,
    alreadyHad,
    filled,
    sheetProfiles: profiles.length,
  });
}
