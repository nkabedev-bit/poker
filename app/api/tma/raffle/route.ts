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

  // One of each kind per tournament. Checked here so the admin is told why, and again
  // in the database so two taps at once cannot both get through.
  const held = extras.raffleHistory.find((item) => item.kind === kind);
  if (held) {
    return NextResponse.json(
      {
        error: `${kind === "vip" ? "VIP розыгрыш" : "Розыгрыш"} уже проводился сегодня — победил номер ${held.winnerNumber} (${held.winnerName})`,
      },
      { status: 409 },
    );
  }

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

  const raffle: Raffle = {
    id: crypto.randomUUID(),
    kind,
    numbers: entrants.map((entrant) => entrant.number),
    // A VIP prize is a certificate handed over at the table; a regular one is a free
    // entry, credited below once the draw itself is safely written down.
    prize: kind === "vip" ? "none" : "manual",
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

    // The prize was already paid in by the time the database refused, so the admin is
    // told exactly what happened rather than being invited to try again.
    if (String(error.message ?? "").includes("Raffle already held")) {
      return NextResponse.json(
        { error: "Этот розыгрыш уже проводился сегодня" },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error:
          error.code === "PGRST202"
            ? "Миграция 202609040003 не применена — розыгрыш не запускается"
            : (error.message ?? "Не удалось запустить розыгрыш"),
      },
      { status: 500 },
    );
  }

  // The free entry goes to the winner's profile, which only exists for a player whose
  // nickname is linked to their Telegram account.
  if (raffle.kind === "regular" && winner.telegramId) {
    const { data: account } = await auth.supabase
      .from("client_bot_users")
      .select("free_entries")
      .eq("telegram_id", winner.telegramId)
      .maybeSingle();

    if (account) {
      const { error: grantError } = await auth.supabase
        .from("client_bot_users")
        .update({ free_entries: Math.max(0, Number(account.free_entries ?? 0)) + 1 })
        .eq("telegram_id", winner.telegramId);

      if (grantError) {
        console.error("Failed to grant the raffle pass", grantError);
      } else {
        raffle.prize = "granted";
        // Writing the same draw again records the prize; the database allows it because
        // the id matches the one already in the history.
        await auth.supabase.rpc("set_tournament_raffle", {
          p_tournament_id: t.id,
          p_raffle: raffle,
        });
      }
    }
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
