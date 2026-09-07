import { after, NextResponse } from "next/server";
import { syncFinanceSheetForTournament } from "@/lib/google-sheets";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { loadTournamentExtras, saveTournamentExtras } from "@/lib/tournament-extras";
import { buildCardSession, normalizeCardCode } from "@/lib/cards/card-code";
import { getFinancePrices } from "@/lib/finance/player-charge";
import { getSettlingPlayers } from "@/lib/timer/lifecycle";
import type { TournamentPlayer } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

/** The patch function is applied by hand; until it exists the old path stands in. */
function isMissingSettlingRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "PGRST202" || String(message ?? "").includes("set_settling_player_paid");
}

/**
 * Marks a player as paid, or takes the mark back. Payment happens at the break that
 * closes re-entries and add-ons, so the bill cannot grow afterwards.
 */
export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase.from("tournaments").select("id").limit(1).single();
  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const cardCode = normalizeCardCode(body.cardCode);
  const playerId = String(body.playerId ?? "");
  const paid = Boolean(body.paid);

  if (!cardCode && !playerId) {
    return NextResponse.json({ error: "Не выбран игрок" }, { status: 400 });
  }

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  // The room may already be empty: the evening finished and the desk is working from
  // the copy it was left.
  const roster = getSettlingPlayers(extras);
  // A card names the player where the club hands them out; on an evening played without
  // them the desk points at the player itself.
  const player = cardCode
    ? roster.find((item) => item.cardCode === cardCode)
    : roster.find((item) => item.id === playerId);

  if (!player) {
    return NextResponse.json(
      { error: cardCode ? "Карта ни за кем не закреплена" : "Игрок не найден" },
      { status: 404 },
    );
  }

  const prices = getFinancePrices(extras.settings);
  const freeroll = extras.settings.tournamentFormat === "freeroll";

  // Once the evening is over the room is empty and the desk is working from the copy;
  // the tick belongs there, and the live-roster function does not know about it.
  if (extras.players.length === 0 && extras.settling) {
    // Patched under the same row lock the live roster gets: the desk settles with
    // several players at once, and writing the whole copy back meant the second tick
    // undid the first — the player it had just marked paid owed the money again.
    const { data: patched, error: patchError } = await auth.supabase.rpc(
      "set_settling_player_paid",
      { p_paid: paid, p_player_id: player.id, p_tournament_id: t.id },
    );

    let settled = patched as TournamentPlayer | null;

    if (patchError) {
      // The function is applied by hand, so a deploy can land before it exists. Until
      // then the whole copy is written back, the way it was before.
      if (!isMissingSettlingRpc(patchError)) throw patchError;

      const fallback = { ...player, paid };
      settled = fallback;
      await saveTournamentExtras(
        {
          settling: {
            ...extras.settling,
            players: roster.map((item) => (item.id === player.id ? fallback : item)),
          },
        },
        "/tma/cards",
        auth.supabase,
      );
    }

    if (!settled) {
      return NextResponse.json({ error: "Игрок не найден" }, { status: 404 });
    }

    after(async () => {
      try {
        await syncFinanceSheetForTournament(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical finance sheet sync error:", sheetError);
      }
    });

    return NextResponse.json({
      session: buildCardSession(settled, player.cardCode ?? "", prices, { freeroll }),
    });
  }

  const { data, error } = await auth.supabase.rpc("set_player_paid", {
    p_tournament_id: t.id,
    p_player_id: player.id,
    p_paid: paid,
  });

  // The admin is at the desk with a queue: say what went wrong instead of a blank
  // failure they cannot act on.
  if (error) {
    console.error("Failed to mark a payment", error);

    const missingFunction =
      error.code === "PGRST202" ||
      String(error.message ?? "").includes("set_player_paid");

    return NextResponse.json(
      {
        error: missingFunction
          ? "Миграция 202609040001 не применена — отметка оплаты не сохраняется"
          : (error.message ?? "Не удалось отметить оплату"),
      },
      { status: 500 },
    );
  }

  // The money tab carries an "Оплатил" column, so the tick has to reach it — and only
  // it: nothing else on the sheets changes when a player settles up.
  after(async () => {
    try {
      await syncFinanceSheetForTournament(auth.supabase, t.id);
    } catch (sheetError) {
      console.error("Non-critical finance sheet sync error after a payment:", sheetError);
    }
  });

  return NextResponse.json({
    session: buildCardSession(data, player.cardCode ?? "", prices, { freeroll }),
  });
}
