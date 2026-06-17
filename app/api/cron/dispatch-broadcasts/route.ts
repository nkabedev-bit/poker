import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { getClientBot, sendTextToClientUsers } from "@/lib/client-bot/broadcast";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const bot = getClientBot();
  if (!bot) {
    return NextResponse.json({ error: "CLIENT_TELEGRAM_BOT_TOKEN is not configured" }, { status: 503 });
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Атомарный захват: pending + due -> sending. Параллельный тик получит 0 строк.
  const { data: due, error } = await supabase
    .from("scheduled_broadcasts")
    .update({ status: "sending" })
    .lte("send_at", new Date().toISOString())
    .eq("status", "pending")
    .select("id, message");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  for (const row of due ?? []) {
    try {
      const result = await sendTextToClientUsers(bot, supabase, row.message);
      await supabase
        .from("scheduled_broadcasts")
        .update({ status: "sent", sent_at: new Date().toISOString(), result })
        .eq("id", row.id);
    } catch (err) {
      await supabase
        .from("scheduled_broadcasts")
        .update({
          status: "failed",
          sent_at: new Date().toISOString(),
          result: { error: String(err) },
        })
        .eq("id", row.id);
    }
    processed += 1;
  }

  return NextResponse.json({ processed });
}
