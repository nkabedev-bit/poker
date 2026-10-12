import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { loadCurrentTournamentContext } from "@/lib/client-bot/server";
import { getPersistedPlayerLabel } from "@/lib/player-labels";
import { listHonorPlates } from "@/lib/players/plate-honors";
import {
  canUsePlate,
  describePlateLock,
  getPlateForm,
  isPlateColor,
  isPlateForm,
  type PlateChoice,
} from "@/lib/players/plates";
import { readPlayerGames } from "@/lib/players/profile";
import { resolvePlayerTier, type PlayerTier } from "@/lib/players/tier";

export const dynamic = "force-dynamic";

/**
 * Sets the plate a player stands on in the hall, or goes back to the tier's plate with
 * `form: null`.
 *
 * The tier is counted here the way the profile counts it, and a plate of honour is
 * checked against the players it was given to, so a picker that shows a shape by
 * mistake still cannot hand it out.
 */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => null)) as { color?: unknown; form?: unknown } | null;
  const requested = body?.form ?? null;

  let plate: PlateChoice | null = null;
  if (requested !== null) {
    if (!isPlateForm(requested)) {
      return NextResponse.json(
        { error: "invalid_plate", message: "Такой плашки нет. Обновите экран." },
        { status: 400 },
      );
    }

    const info = getPlateForm(requested);
    if (!info.fixedArt && !isPlateColor(body?.color)) {
      return NextResponse.json(
        { error: "invalid_color", message: "Выберите цвет из палитры." },
        { status: 400 },
      );
    }

    let tier: PlayerTier | null = null;
    let games = 0;
    if (info.tier) {
      const [context, played] = await Promise.all([
        loadCurrentTournamentContext(auth.supabase),
        readPlayerGames(auth.supabase, {
          nickname: auth.user.display_name ?? "",
          telegramId: auth.user.telegram_id,
        }),
      ]);
      games = played.length;
      tier = resolvePlayerTier({
        games,
        label: getPersistedPlayerLabel(context?.extras.playerLabels, auth.user.display_name),
      });
    }

    if (!canUsePlate(requested, { honors: listHonorPlates(auth.user.id), tier })) {
      return NextResponse.json(
        {
          error: "plate_locked",
          message: info.tier
            ? `${info.name}: ${describePlateLock(requested, games).replace(/^./, (letter) => letter.toLowerCase())}.`
            : `Плашка «${info.name}» выдаётся поимённо.`,
        },
        { status: 403 },
      );
    }

    plate = { color: info.fixedArt ? null : (body?.color as PlateChoice["color"]), form: requested };
  }

  const { error } = await auth.supabase
    .from("client_bot_users")
    .update({ plate_color: plate?.color ?? null, plate_form: plate?.form ?? null })
    .eq("id", auth.user.id);

  if (error) {
    // The columns come with a migration applied by hand.
    if (String(error.message ?? "").includes("plate_")) {
      return NextResponse.json(
        { error: "not_ready", message: "Плашки ещё не включены в клубе. Попробуйте позже." },
        { status: 503 },
      );
    }
    throw error;
  }

  return NextResponse.json({ plate });
}
