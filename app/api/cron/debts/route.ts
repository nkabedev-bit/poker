import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { announceEndedAllowances, sendDebtReminders } from "@/lib/debts/reminders";
import { createBot } from "@/lib/telegram/bot-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The debt work pg_cron hands over: the 18:00 reminder to players who owe, and the
 * message to an admin whose /allowdebt has just run out. The database only calls when
 * there is something to do (202610070001).
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

  const body = await request.json().catch(() => ({}));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (body.task === "remind") {
      return NextResponse.json(
        await sendDebtReminders(supabase, (accountId, message) =>
          notifyClientUser(supabase, accountId, message),
        ),
      );
    }

    if (body.task === "allowances") {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 503 });
      }

      const adminBot = createBot(token);
      return NextResponse.json(
        await announceEndedAllowances(supabase, async (adminId, message) => {
          await adminBot.api.sendMessage(adminId, message);
        }),
      );
    }
  } catch (error) {
    console.error("Debt cron task failed", error);
    return NextResponse.json({ error: "Debt task failed" }, { status: 500 });
  }

  return NextResponse.json({ error: "Unknown task" }, { status: 400 });
}
