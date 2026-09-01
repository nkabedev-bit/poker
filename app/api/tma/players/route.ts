import { NextResponse } from "next/server";
import { requireTmaAuth } from "@/lib/tma/require-auth";
import { syncVipSheet } from "@/lib/google-sheets";
import { loadTournamentExtras } from "@/lib/tournament-extras";
import {
  appendTournamentPlayerWithRegistrationNumber,
  buildAdminRegistrationFullMessage,
  isTournamentRegistrationCapacityError,
  TournamentRegistrationCapacityError,
} from "@/lib/tournament-player-registration";
import { findClientBotUserByNickname } from "@/lib/client-bot/nickname-match";
import { getEffectiveTimerState, isReentryAvailable } from "@/lib/timer/calculate";
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
    (extras.settings.tournamentFormat ?? "regular") === "regular" &&
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

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const extras = await loadTournamentExtras(t.id, auth.supabase);

  // A walk-in typed by hand still owns an account and a history. Games, knockouts and
  // final tables are credited by Telegram id, so without this lookup everything the
  // player does tonight would be counted for nobody.
  const match = await findClientBotUserByNickname(auth.supabase, String(name));

  const newPlayer = {
    id: crypto.randomUUID(),
    name,
    stack: Number(t.starting_stack) || 10000,
    table: Number(table) || 1,
    seat: Number(seat) || 1,
    status: "active" as const,
    rebuys: 0,
    addons: 0,
    addonChipsTotal: 0,
    bountyChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
    registeredVia: "admin" as const,
    ...(match.user ? { telegramId: match.user.telegramId } : {}),
  };

  try {
    const player = await appendTournamentPlayerWithRegistrationNumber({
      extras,
      player: newPlayer,
      publicToken: t.public_token,
      redirectTo: "/tma/players",
      supabase: auth.supabase,
      tournamentId: t.id,
    });

    try {
      await syncVipSheet(auth.supabase, t.id);
    } catch (sheetError) {
      console.error("Failed to sync VIP sheet", sheetError);
    }

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

    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("No registration numbers available") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
