import { NextResponse } from "next/server";
import { Bot } from "grammy";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { readBirthdayAccounts } from "@/lib/client-bot/birthday-store";
import {
  isMonthDigestDay,
  monthName,
  moscowNextMonth,
  pickBirthdaysInMonth,
  pickBirthdaysToday,
} from "@/lib/client-bot/birthdays";
import { buildMonthBirthdaysMessage } from "@/lib/admin-bot/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Единственный админ, которому идут уведомления о днях рождения (бот управления игрой).
const BIRTHDAY_ADMIN_CHAT_ID = 384428007;

/**
 * Runs at 21:00 UTC, which is midnight in Moscow — the club's own day, just begun.
 *
 * Two things at once, because they belong to the same schedule: whose birthday it is
 * today, and on the twentieth, everyone whose birthday falls in the month ahead — early
 * enough that whoever plans the evenings can arrange something. One cron entry rather
 * than two the admin would have to set up by hand.
 *
 * Dates come from the accounts now, not from the spreadsheet: a date the club can only
 * see on paper is one the app cannot act on.
 */
export async function POST(request: Request) {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return NextResponse.json({ error: "Server env not configured" }, { status: 503 });
  }

  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 503 });
  }
  const bot = new Bot(token);

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const accounts = await readBirthdayAccounts(supabase);
  const now = new Date();

  let sent = 0;
  let failed = 0;

  const send = async (text: string) => {
    try {
      await bot.api.sendMessage(BIRTHDAY_ADMIN_CHAT_ID, text);
      sent += 1;
    } catch (error) {
      console.error("Birthday notify send failed", error);
      failed += 1;
    }
  };

  const today = pickBirthdaysToday(accounts, now);
  for (const birthday of today) {
    await send(`Сегодня День Рождения игроку (${birthday.nickname})`);
  }

  // The month ahead, sent while there is still time to plan for it.
  const ahead = moscowNextMonth(now);
  const monthly = isMonthDigestDay(now) ? pickBirthdaysInMonth(accounts, ahead) : [];
  if (isMonthDigestDay(now)) {
    await send(buildMonthBirthdaysMessage(monthly, monthName(ahead)));
  }

  return NextResponse.json({
    failed,
    monthly: monthly.length,
    notified: sent,
    today: today.length,
  });
}
