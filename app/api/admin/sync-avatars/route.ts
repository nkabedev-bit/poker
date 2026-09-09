import { NextResponse } from "next/server";
import { syncClientBotAvatar } from "@/lib/client-bot/avatar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 20;

/**
 * How recently a photo must have been fetched to be left alone by a forced pass.
 *
 * It is what makes the run finish: the batch just done drops out of the next query, so
 * repeated calls walk the roster instead of circling its first page.
 */
const RESYNC_WINDOW_MS = 60 * 60 * 1000;

/**
 * Fetches profile photos for players who have none.
 *
 * Photos arrive on their own when a player opens the app, but that only fills in as
 * people come back. This walks the roster instead, in batches: each call handles a
 * few players and reports how many are left, because downloading and resizing a
 * hundred images does not fit in one request.
 *
 * With "force" it refreshes players who already have a photo too — for when the club
 * changes the size it stores them at, or somebody changed their picture.
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  // "force" also refreshes players who already have a photo, for when someone changed it.
  const force = Boolean(body.force);

  // A photo the player uploaded themselves is never overwritten, force or not.
  const pending = supabase
    .from("client_bot_users")
    .select("telegram_id", { count: "exact" })
    .eq("avatar_is_custom", false)
    // Longest untouched first. Every sync stamps `avatar_synced_at`, so this is a queue
    // that advances on its own.
    .order("avatar_synced_at", { ascending: true, nullsFirst: true });

  // A forced pass takes whoever has not been refreshed this hour. Without that it would
  // hand back the same twenty players on every call — nothing about them changes to take
  // them out of the batch — and the run could never reach the end of the roster.
  const staleBefore = new Date(Date.now() - RESYNC_WINDOW_MS).toISOString();
  const { count, data, error } = await (force
    ? pending.or(`avatar_synced_at.is.null,avatar_synced_at.lt."${staleBefore}"`)
    : pending.is("avatar_url", null)
  ).limit(BATCH_SIZE);

  if (error) throw error;

  const token = process.env.CLIENT_TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    return NextResponse.json({ error: "Не настроен токен клиентского бота" }, { status: 503 });
  }

  let updated = 0;
  let withoutPhoto = 0;

  for (const row of data ?? []) {
    const telegramId = Number((row as { telegram_id: number }).telegram_id);

    try {
      const url = await syncClientBotAvatar({ supabase, telegramId, token });
      if (url) updated += 1;
      else withoutPhoto += 1;
    } catch (syncError) {
      // One unreachable photo must not stop the run: the player keeps their letter and
      // the batch moves on.
      console.error("Avatar sync failed for", telegramId, syncError);
      withoutPhoto += 1;
    }
  }

  const processed = data?.length ?? 0;

  return NextResponse.json({
    processed,
    remaining: Math.max(0, (count ?? processed) - processed),
    updated,
    withoutPhoto,
  });
}
