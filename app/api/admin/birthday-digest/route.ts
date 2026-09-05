import { NextResponse } from "next/server";
import { Bot } from "grammy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readBirthdayAccounts } from "@/lib/client-bot/birthday-store";
import { moscowMonthName, pickBirthdaysThisMonth } from "@/lib/client-bot/birthdays";
import { buildMonthBirthdaysMessage } from "@/lib/admin-bot/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The same admin the nightly notice goes to.
const BIRTHDAY_ADMIN_CHAT_ID = 384428007;

async function buildDigest() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Не авторизован" as const, message: "", supabase, count: 0 };

  const now = new Date();
  const birthdays = pickBirthdaysThisMonth(await readBirthdayAccounts(supabase), now);

  return {
    count: birthdays.length,
    error: null,
    message: buildMonthBirthdaysMessage(birthdays, moscowMonthName(now)),
    supabase,
  };
}

/**
 * The month's birthdays as the admin would receive them — read, not sent.
 *
 * The summary rides the first of the month on its own, and this is for the times the
 * club wants it in the middle of one: seeing the message before it goes is the point,
 * so reading and sending are separate on purpose.
 */
export async function GET() {
  const digest = await buildDigest();
  if (digest.error) return NextResponse.json({ error: digest.error }, { status: 401 });

  return NextResponse.json({ count: digest.count, message: digest.message, sent: false });
}

/** Sends that same message to the admin, now. */
export async function POST() {
  const digest = await buildDigest();
  if (digest.error) return NextResponse.json({ error: digest.error }, { status: 401 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Не настроен TELEGRAM_BOT_TOKEN" }, { status: 503 });
  }

  try {
    await new Bot(token).api.sendMessage(BIRTHDAY_ADMIN_CHAT_ID, digest.message);
  } catch (error) {
    console.error("Could not send the month digest", error);
    return NextResponse.json({ error: "Телеграм не принял сообщение" }, { status: 502 });
  }

  return NextResponse.json({ count: digest.count, message: digest.message, sent: true });
}
