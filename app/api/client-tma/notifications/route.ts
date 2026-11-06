import { after, NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { saveNotificationsConsent } from "@/lib/client-bot/notifications-consent";

export const dynamic = "force-dynamic";

/**
 * Turns the club's broadcasts on or off for the player — the same answer the
 * questionnaire asks for, which until now could not be changed once given. Messages
 * about the player's own games (a pair invitation, a seat from the waitlist) are not
 * broadcasts and keep coming either way.
 */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const enabled = (body as { enabled?: unknown } | null)?.enabled;

  if (typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "invalid", message: "Не поняли, включить уведомления или выключить." },
      { status: 400 },
    );
  }

  await saveNotificationsConsent(auth.supabase, auth.user.id, enabled);

  // The club's own copy of the questionnaire follows. The database is what the bot goes
  // by, so a sheet that cannot be written does not take the answer back.
  const telegramId = auth.user.telegram_id;
  if (telegramId !== null) {
    after(async () => {
      try {
        const { setNotificationsInClientBotProfileSheet } = await import("@/lib/google-sheets");
        await setNotificationsInClientBotProfileSheet({ enabled, telegramId });
      } catch (sheetError) {
        console.error("Failed to update notifications in the questionnaire sheet", sheetError);
      }
    });
  }

  return NextResponse.json({ enabled });
}
