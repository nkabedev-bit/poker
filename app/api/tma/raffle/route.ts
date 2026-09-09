import { randomInt } from "crypto";
import { adjustFreeEntries } from "@/lib/free-entries/adjust";
import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import { broadcastPublicState } from "@/lib/realtime/broadcast";
import { notifyClientUser } from "@/lib/client-bot/notify";
import { loadPlayerAvatars } from "@/lib/players/avatars";
import {
  listRaffleEntrants,
  pickRaffleWinner,
  RAFFLE_SPIN_SECONDS,
  RAFFLE_WIN_MESSAGE,
  type Raffle,
} from "@/lib/raffle/raffle";

export const dynamic = "force-dynamic";

/**
 * Runs a draw on the big screen.
 *
 * The winner is decided here, with the platform's cryptographic randomness, and stored
 * with the draw: the reel in the hall is an animation that lands on a result already
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

  // The faces travel with the draw rather than being looked up by the screen: the reel
  // must show the room the players who were in the draw when it was taken, whoever is
  // seated by the time it stops turning.
  const avatars = await loadPlayerAvatars(auth.supabase);

  const raffle: Raffle = {
    faces: entrants.map((entrant) => ({
      avatarUrl: avatars.find({ name: entrant.name, telegramId: entrant.telegramId }).url,
      name: entrant.name,
      number: entrant.number,
    })),
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

  // The free entry goes to the winner's profile, which exists for anyone seated from a
  // sign-up — through the bot or through the web. A player the admin added by hand has
  // no account behind the seat, and the pass is handed over at the table instead.
  if (raffle.kind === "regular" && (winner.accountId || winner.telegramId)) {
    let granted = false;
    try {
      const change = await adjustFreeEntries(auth.supabase, {
        delta: 1,
        holder: { accountId: winner.accountId, telegramId: winner.telegramId },
        vip: false,
      });

      granted = change !== null;
    } catch (grantError) {
      console.error("Failed to grant the raffle pass", grantError);
    }

    if (granted) {
      raffle.prize = "granted";
      // The ledger is bookkeeping: the pass is already in the profile, so a Sheets
      // failure must not fail the draw.
      try {
        const { appendFreeEntryGrant } = await import("@/lib/google-sheets");
        await appendFreeEntryGrant({
          count: 1,
          nickname: winner.name,
          source: "raffle",
          vip: false,
        });
      } catch (sheetError) {
        console.error("Failed to log the raffle pass", sheetError);
      }
      // Writing the same draw again records the prize; the database allows it because
      // the id matches the one already in the history.
      await auth.supabase.rpc("set_tournament_raffle", {
        p_tournament_id: t.id,
        p_raffle: raffle,
      });
    }
  }

  // The winner hears it from the bot as well as from the screen: they may be at the bar
  // when the wheel stops, and a prize nobody noticed is a prize nobody collects.
  //
  // A regular pass is announced only once it has actually been credited — the message
  // sends the player to look for it in the app, and must not send them to an empty
  // profile. The VIP certificate is handed over at the table, so it is announced as soon
  // as the draw stands. A player seated by hand has no account and no chat to write to;
  // the admin is told to hand the prize over instead.
  if (winner.accountId && (raffle.kind === "vip" || raffle.prize === "granted")) {
    try {
      await notifyClientUser(auth.supabase, winner.accountId, RAFFLE_WIN_MESSAGE[raffle.kind]);
    } catch (notifyError) {
      // The draw is written down and the prize is paid in; a bot that will not deliver
      // must not turn either of those into an error on the admin's screen.
      console.error("Failed to tell the raffle winner", notifyError);
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
