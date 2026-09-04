import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import {
  listRaffleEntrants,
  pickRaffleWinner,
  RAFFLE_SPIN_SECONDS,
  type Raffle,
  type RafflePrize,
} from "@/lib/raffle/raffle";

export const dynamic = "force-dynamic";

/**
 * Runs a draw on the big screen.
 *
 * The winner is decided here, with the platform's cryptographic randomness, and stored
 * with the draw: the wheel in the hall is an animation that lands on a result already
 * taken, so every screen agrees and no browser can steer it.
 */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const kind = body.kind === "vip" ? "vip" : "regular";

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const entrants = listRaffleEntrants(extras.players, kind);

  if (entrants.length === 0) {
    return NextResponse.json(
      {
        error:
          kind === "vip"
            ? "Сегодня нет игроков с VIP-билетом"
            : "Нет игроков с номерами — розыгрыш не из кого проводить",
      },
      { status: 409 },
    );
  }

  const winner = pickRaffleWinner(entrants, () => randomInt(0, 2 ** 31) / 2 ** 31);
  if (!winner) return NextResponse.json({ error: "Не удалось выбрать победителя" }, { status: 500 });

  // The regular draw pays a free entry into the winner's profile, which only exists for
  // a player whose nickname is linked to their Telegram account. A VIP prize is a
  // certificate handed over at the table, so nothing is credited.
  let prize: RafflePrize = "none";

  if (kind === "regular") {
    prize = "manual";

    if (winner.telegramId) {
      const { data: account } = await auth.supabase
        .from("client_bot_users")
        .select("free_entries")
        .eq("telegram_id", winner.telegramId)
        .maybeSingle();

      if (account) {
        const { error } = await auth.supabase
          .from("client_bot_users")
          .update({ free_entries: Math.max(0, Number(account.free_entries ?? 0)) + 1 })
          .eq("telegram_id", winner.telegramId);

        if (error) console.error("Failed to grant the raffle pass", error);
        else prize = "granted";
      }
    }
  }

  const raffle: Raffle = {
    id: crypto.randomUUID(),
    kind,
    numbers: entrants.map((entrant) => entrant.number),
    prize,
    spinSeconds: RAFFLE_SPIN_SECONDS,
    startedAt: new Date().toISOString(),
    winnerName: winner.name,
    winnerNumber: winner.number,
  };

  const { error } = await auth.supabase.rpc("set_tournament_raffle", {
    p_tournament_id: t.id,
    p_raffle: raffle,
  });

  if (error) {
    console.error("Failed to store the raffle", error);
    const missing = error.code === "PGRST202";

    return NextResponse.json(
      {
        error: missing
          ? "Миграция 202609040003 не применена — розыгрыш не запускается"
          : (error.message ?? "Не удалось запустить розыгрыш"),
      },
      { status: 500 },
    );
  }

  await broadcastPublicState(t.public_token);

  return NextResponse.json({ raffle });
}

/** Takes the draw off the screen once the prize has been handed over. */
export async function DELETE(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id, public_token")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const { error } = await auth.supabase.rpc("set_tournament_raffle", {
    p_tournament_id: t.id,
    p_raffle: null,
  });

  if (error) throw error;

  await broadcastPublicState(t.public_token);

  return NextResponse.json({ closed: true });
}
