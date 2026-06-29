import { NextResponse } from "next/server";
import { Bot } from "grammy";
import { getServerEnv } from "@/lib/env";
import { getTodayBirthdayNicknames } from "@/lib/google-sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Единственный админ, которому идут уведомления о днях рождения (бот управления игрой).
const BIRTHDAY_ADMIN_CHAT_ID = 384428007;

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

  const nicknames = await getTodayBirthdayNicknames();

  let sent = 0;
  let failed = 0;
  for (const nickname of nicknames) {
    try {
      await bot.api.sendMessage(
        BIRTHDAY_ADMIN_CHAT_ID,
        `Сегодня День Рождения игроку (${nickname})`,
      );
      sent += 1;
    } catch (error) {
      console.error("Birthday notify send failed", { nickname, error });
      failed += 1;
    }
  }

  return NextResponse.json({ notified: sent, failed, total: nicknames.length });
}
