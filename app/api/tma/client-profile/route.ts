import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";

export const dynamic = "force-dynamic";

type ProfileAnswers = {
  agreementAccepted?: boolean;
  birthDate?: string;
  discoverySource?: string;
  fullName?: string;
  nickname?: string;
  notificationsConsent?: boolean;
  phone?: string;
  ratingConsent?: boolean;
};

/**
 * The questionnaire a player filled in when they joined, as the club stored it. The
 * admin reads it beside the sign-up: who is actually coming, how to reach them, and
 * whether they agreed to the rating and to being written to.
 */
export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const telegramId = Number(new URL(request.url).searchParams.get("telegramId"));
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    return NextResponse.json({ error: "Не выбран игрок" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("client_bot_users")
    .select(
      "telegram_id, username, display_name, avatar_url, created_at, profile_submitted_at, pending_profile_answers, free_entries, vip_free_entries",
    )
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return NextResponse.json({ error: "Анкета не найдена" }, { status: 404 });

  const record = data as {
    avatar_url: string | null;
    created_at: string | null;
    display_name: string | null;
    free_entries: number | null;
    pending_profile_answers: ProfileAnswers | null;
    profile_submitted_at: string | null;
    telegram_id: number;
    username: string | null;
    vip_free_entries: number | null;
  };
  const answers = record.pending_profile_answers ?? {};

  return NextResponse.json({
    profile: {
      agreementAccepted: Boolean(answers.agreementAccepted),
      avatarUrl: record.avatar_url,
      birthDate: answers.birthDate ?? "",
      discoverySource: answers.discoverySource ?? "",
      displayName: record.display_name,
      freeEntries: {
        regular: Number(record.free_entries ?? 0),
        vip: Number(record.vip_free_entries ?? 0),
      },
      fullName: answers.fullName ?? "",
      joinedAt: record.created_at,
      notificationsConsent: Boolean(answers.notificationsConsent),
      phone: answers.phone ?? "",
      ratingConsent: Boolean(answers.ratingConsent),
      submittedAt: record.profile_submitted_at,
      telegramId: record.telegram_id,
      username: record.username,
    },
  });
}
