import { after, NextResponse } from "next/server";
import { isDoubleReentryBannedByFormat } from "@/lib/tma/reentry-eligibility";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { syncVipSheet } from "@/lib/google-sheets";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import {
  appendTournamentPlayerWithRegistrationNumber,
  appendUnseatedTournamentPlayer,
  buildAdminRegistrationFullMessage,
  buildRegularNumbersExhaustedMessage,
  isRegularRegistrationNumbersExhaustedError,
  isTournamentRegistrationCapacityError,
  TournamentRegistrationCapacityError,
} from "@/lib/tournament-player-registration";
import { findClientBotUserByNickname } from "@/lib/client-bot/nickname-match";
import { isTicketType } from "@/lib/cards/card-code";
import { markTonightSignupSeated } from "@/lib/events/store";
import { getEffectiveTimerState, isReentryAvailable } from "@/lib/timer/calculate";
import { readSeatsPerTable } from "@/lib/tables/seating";
import type { BlindLevel, TimerState } from "@/lib/timer/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const extras = await loadTournamentExtras(t.id, auth.supabase);
  const { data: timerRow } = await auth.supabase
    .from("timer_state")
    .select("*")
    .eq("tournament_id", t.id)
    .single();
  const { data: levelRows } = await auth.supabase
    .from("blind_levels")
    .select("*")
    .eq("tournament_id", t.id)
    .order("level_order");

  const timerState: TimerState = {
    status: timerRow?.status ?? "not_started",
    currentLevelIndex: timerRow?.current_level_index ?? 0,
    levelStartedAt: timerRow?.level_started_at ?? null,
    pausedRemainingSeconds: timerRow?.paused_remaining_seconds ?? null,
    registrationClosesAt: timerRow?.registration_closes_at ?? null,
    finishedAt: timerRow?.finished_at ?? null,
  };
  const blindLevels: BlindLevel[] = (levelRows ?? []).map((row) => ({
    id: row.id,
    levelOrder: row.level_order,
    smallBlind: row.small_blind,
    bigBlind: row.big_blind,
    ante: row.ante,
    reentryCloses: Boolean(row.reentry_closes),
    doubleReentryAvailable: Boolean(row.double_reentry_available),
    durationSeconds: row.duration_seconds,
    isBreak: row.is_break,
    breakDurationSeconds: row.break_duration_seconds,
  }));

  const now = new Date();
  const reentryAvailable = extras.settings.reentryEnabled
    ? isReentryAvailable(timerState, blindLevels, now)
    : false;
  const currentLevel =
    blindLevels[getEffectiveTimerState(timerState, blindLevels, now).currentLevelIndex];
  // PHOENIX / DEEP STACK formats allow regular re-entries only — the double (x2)
  // option is suppressed even when the blind level carries the x2 flag.
  const doubleReentryAvailable =
    reentryAvailable &&
    !isDoubleReentryBannedByFormat(extras.settings.tournamentFormat) &&
    Boolean(currentLevel?.doubleReentryAvailable);

  return NextResponse.json({
    isBounty: extras.settings.isBounty,
    bountyType: extras.settings.bountyType ?? "standard",
    addonEnabled: extras.settings.addonEnabled,
    maxAddons: extras.settings.maxAddons,
    maxReentries: extras.settings.maxReentries,
    players: extras.players || [],
    // Wanted Bounty: the admin-configured knockout points for a regular (non-wanted)
    // victim, surfaced so the confirm screen can show the exact award.
    ptsBountyPoints: Math.max(0, Number(extras.pts.bountyPoints) || 0),
    // The club's tables seat nine or ten depending on the room, and the plan has to be
    // drawn with the chairs that are actually there.
    seatsPerTable: extras.settings.maxPlayersPerTable,
    tablesCount: extras.settings.tablesCount,
    reentryAvailable,
    doubleReentryAvailable,
    reentryEnabled: extras.settings.reentryEnabled,
  });
}

export async function POST(request: Request) {
  const auth = await requireTmaAuth(request);
  if (auth.error) return auth.error;

  const { data: t } = await auth.supabase
    .from("tournaments")
    .select("id, public_token, starting_stack")
    .limit(1)
    .single();

  if (!t) return NextResponse.json({ error: "No tournament" }, { status: 404 });

  const body = await request.json();
  const { name, table, seat } = body;
  // Half of a "1+1", typed in at the door: the ticket was bought by the player who
  // brought them, and the two split its price.
  const duoTicket = body.duoTicket === true;
  // The ticket the desk picked for a walk-in, when it already knows. The number follows
  // it — a VIP guest typed in by hand belongs in the VIP draw wherever they end up
  // sitting — and without one the table decides, as it always did.
  const ticketType = isTicketType(body.ticketType) ? body.ticketType : null;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const extras = await loadTournamentExtras(t.id, auth.supabase);

  // A chair the desk named when it typed the player in. Nothing above this point knows
  // the room, so the table and the seat are checked against it here.
  const tableNumber = Number.isInteger(Number(table)) && Number(table) > 0 ? Number(table) : null;
  const seatNumber = Number.isInteger(Number(seat)) && Number(seat) > 0 ? Number(seat) : null;
  const tablesCount = Math.max(1, Number(extras.settings.tablesCount ?? 1));
  const seatsPerTable = readSeatsPerTable(extras.settings.maxPlayersPerTable);

  if (tableNumber && tableNumber > tablesCount) {
    return NextResponse.json({ error: "Выберите номер стола" }, { status: 400 });
  }
  if (seatNumber && seatNumber > seatsPerTable) {
    return NextResponse.json({ error: "Выберите место за столом" }, { status: 400 });
  }

  // Two people cannot be given one chair: the plan on the admin's screen was drawn a
  // moment ago, and somebody may have sat down since.
  if (tableNumber && seatNumber) {
    const seatTaken = extras.players.find(
      (item) => item.status === "active" && item.table === tableNumber && item.seat === seatNumber,
    );

    if (seatTaken) {
      return NextResponse.json(
        { error: `Место ${seatNumber} за столом ${tableNumber} занято: ${seatTaken.name}` },
        { status: 409 },
      );
    }
  }

  // A walk-in typed by hand still owns an account and a history. Tonight is credited to
  // that account, so without this lookup everything the player does would be counted for
  // nobody — and a player who signed in on the web has no Telegram id to fall back on.
  const match = await findClientBotUserByNickname(auth.supabase, String(name));

  const newPlayer = {
    id: crypto.randomUUID(),
    name,
    stack: Number(t.starting_stack) || 10000,
    table: tableNumber,
    // No chair until a card is handed over, unless the desk named one: the seating plan
    // is where players are sat down, and a default seat would show four walk-ins sharing
    // seat 1.
    seat: seatNumber,
    status: "active" as const,
    rebuys: 0,
    addons: 0,
    addonChipsTotal: 0,
    bountyChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
    registeredVia: "admin" as const,
    ...(duoTicket ? { duoTicket } : {}),
    ...(ticketType ? { ticketType } : {}),
    ...(match.user ? { accountId: match.user.id, telegramId: match.user.telegramId } : {}),
  };

  try {
    // Somebody who walked in off the street has picked no ticket yet, and the number
    // follows the ticket — so they go on the roster bare and turn up on the desk's
    // screen among those still to be seated. A table given here means the admin has
    // already decided, and the old path stands.
    const player = newPlayer.table
      ? await appendTournamentPlayerWithRegistrationNumber({
          extras,
          player: newPlayer,
          publicToken: t.public_token,
          redirectTo: "/tma/players",
          supabase: auth.supabase,
          tournamentId: t.id,
        })
      : await appendUnseatedTournamentPlayer({
          extras,
          player: newPlayer,
          redirectTo: "/tma/players",
          supabase: auth.supabase,
        });

    // The sheet is the club's own copy, not something the admin waits for: writing it
    // took a second of its own while a queue stood at the door.
    after(async () => {
      try {
        await syncVipSheet(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Failed to sync VIP sheet", sheetError);
      }

      // They are at a table now, so their own sign-up is not waiting for anything —
      // least of all a place in the queue they were standing in.
      if (!match.user) return;
      try {
        await markTonightSignupSeated(auth.supabase, match.user.id);
      } catch (signupError) {
        console.error("Failed to close the sign-up of a walk-in", signupError);
      }
    });

    return NextResponse.json({
      // The admin is told who the nickname was matched to, so a wrong match is caught
      // on the spot rather than at the end of the tournament.
      linkedTo: match.user
        ? { displayName: match.user.displayName, username: match.user.username }
        : null,
      nicknameAmbiguous: match.ambiguous,
      player,
    });
  } catch (error) {
    if (isTournamentRegistrationCapacityError(error)) {
      const registeredPlayersCount = error instanceof TournamentRegistrationCapacityError
        ? error.registeredPlayersCount
        : extras.players.length;

      return NextResponse.json(
        { error: buildAdminRegistrationFullMessage(registeredPlayersCount) },
        { status: 409 },
      );
    }

    if (isRegularRegistrationNumbersExhaustedError(error)) {
      return NextResponse.json({ error: buildRegularNumbersExhaustedMessage() }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
