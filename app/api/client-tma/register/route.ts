import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import {
  buildClientBotPlayer,
  isRegistrationCodeMatch,
} from "@/lib/client-bot/registration";
import {
  appendTournamentPlayerWithRegistrationNumber,
  isTournamentRegistrationCapacityError,
} from "@/lib/tournament-player-registration";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  if (!auth.user.profile_submitted_at) {
    return NextResponse.json(
      { error: "profile_required", message: "Сначала заполните анкету в боте." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";
  const tableNumber = Number(body.table);

  const context = await loadCurrentTournamentContext(auth.supabase);
  if (!context) {
    return NextResponse.json(
      { error: "no_tournament", message: "Турнир пока не настроен." },
      { status: 404 },
    );
  }

  if (!isRegistrationCodeMatch(code, context.extras.clientBot.registrationCode)) {
    return NextResponse.json(
      { error: "invalid_code", message: "Кодовое слово не подошло." },
      { status: 400 },
    );
  }

  const tablesCount = Math.max(1, Math.floor(context.extras.settings.tablesCount));
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > tablesCount) {
    return NextResponse.json(
      { error: "invalid_table", message: "Выберите номер стола из списка." },
      { status: 400 },
    );
  }

  const existingPlayer = context.extras.players.find(
    (player) => player.telegramId === auth.user.telegram_id,
  );
  if (existingPlayer) {
    await auth.supabase
      .from("client_bot_users")
      .update({ registered_player_id: existingPlayer.id })
      .eq("telegram_id", auth.user.telegram_id);

    return NextResponse.json({
      alreadyRegistered: true,
      registrationNumber: existingPlayer.registrationNumber ?? null,
      table: existingPlayer.table ?? null,
      name: existingPlayer.name,
    });
  }

  const name = auth.user.display_name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "no_nickname", message: "Не найден никнейм. Заполните анкету в боте." },
      { status: 400 },
    );
  }

  const playerDraft = buildClientBotPlayer({
    name,
    startingStack: context.tournament.starting_stack,
    tableNumber,
    telegramId: auth.user.telegram_id,
  });

  let player;
  try {
    player = await appendTournamentPlayerWithRegistrationNumber({
      extras: context.extras,
      player: playerDraft,
      publicToken: context.tournament.public_token,
      redirectTo: "/tma/players",
      supabase: auth.supabase,
      tournamentId: context.tournament.id,
    });
  } catch (error) {
    if (isTournamentRegistrationCapacityError(error)) {
      return NextResponse.json(
        { error: "capacity", message: "Все места заняты, уточните ситуацию у админов." },
        { status: 409 },
      );
    }
    throw error;
  }

  await auth.supabase
    .from("client_bot_users")
    .update({
      registered_at: new Date().toISOString(),
      registered_player_id: player.id,
    })
    .eq("telegram_id", auth.user.telegram_id);

  try {
    const { syncVipSheet } = await import("@/lib/google-sheets");
    await syncVipSheet(auth.supabase, context.tournament.id);
  } catch (sheetError) {
    console.error("Failed to sync VIP sheet", sheetError);
  }

  return NextResponse.json({
    registrationNumber: player.registrationNumber ?? null,
    table: player.table ?? null,
    name: player.name,
  });
}
