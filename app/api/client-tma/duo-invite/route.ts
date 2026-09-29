import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { claimDuoInvite, findDuoInviterName } from "@/lib/events/duo";

export const dynamic = "force-dynamic";

const MESSAGES = {
  gone: "Приглашение больше не действует — возможно, его уже приняли.",
  self: "Это ваше собственное приглашение.",
  taken: "Вас уже зовут вторым игроком на этот турнир.",
} as const;

/**
 * Takes up the invitation a link carried.
 *
 * The player has an account by the time this runs — through the bot or through Yandex —
 * and this is where the ticket's second half becomes theirs. The questionnaire can still
 * be unfilled: they see the invitation waiting on the tournament and answer it once the
 * club knows who they are.
 */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const outcome = await claimDuoInvite(auth.supabase, {
    token: String(body.token ?? ""),
    userId: auth.user.id,
  });

  if (outcome.error) {
    return NextResponse.json(
      { error: outcome.error, message: MESSAGES[outcome.error] },
      { status: outcome.error === "self" ? 409 : 404 },
    );
  }

  return NextResponse.json({ claimed: true, eventId: outcome.eventId });
}

/**
 * Who asked this player along, for the questionnaire to fill in as the one who invited
 * them. Only a suggestion: the player can change it or clear it, and the questionnaire
 * checks whatever they send.
 */
export async function GET(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  return NextResponse.json({ inviter: await findDuoInviterName(auth.supabase, auth.user.id) });
}
