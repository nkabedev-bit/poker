import { after, NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { describeNicknameRefusal, parseNewNickname } from "@/lib/players/nickname-change";

export const dynamic = "force-dynamic";

type ChangeResult = {
  availableAt?: string;
  error?: string;
  newName?: string;
  ok?: boolean;
  oldName?: string;
};

// The function comes with a migration applied by hand (202610090001).
function isMissingRpc(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || String(error.message ?? "").includes("change_player_nickname");
}

/**
 * The player changes their own nickname.
 *
 * Everything that decides it happens inside one database function: the account, the
 * games, the closed seasons and the player's label move to the new nickname together,
 * or nothing moves — a nickname changed on the account but not on the games would leave
 * a web player without a single game behind them.
 */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = parseNewNickname((body as { nickname?: unknown } | null)?.nickname);

  if ("message" in parsed) {
    return NextResponse.json({ error: "invalid", message: parsed.message }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc("change_player_nickname", {
    p_nickname: parsed.nickname,
    p_user_id: auth.user.id,
  });

  if (error) {
    if (isMissingRpc(error)) {
      return NextResponse.json(
        { error: "not_ready", message: "Смена ника ещё не включена в клубе. Попробуйте позже." },
        { status: 503 },
      );
    }
    throw error;
  }

  const result = (data ?? {}) as ChangeResult;

  if (!result.ok || !result.newName) {
    const code = result.error ?? "unknown";
    return NextResponse.json(
      {
        availableAt: result.availableAt ?? null,
        error: code,
        message: describeNicknameRefusal(code, result.availableAt),
      },
      { status: code === "invalid" ? 400 : 409 },
    );
  }

  const { newName, oldName = "" } = result;

  // The club's paper copy of the questionnaire follows. The database is what counts, so
  // a sheet that cannot be written does not take the new nickname back.
  after(async () => {
    try {
      const { renameInClientBotProfileSheet } = await import("@/lib/google-sheets");
      await renameInClientBotProfileSheet({ newName, oldName, telegramId: auth.user.telegram_id });
    } catch (sheetError) {
      console.error("Failed to rename the player in the questionnaire sheet", sheetError);
    }
  });

  return NextResponse.json({ availableAt: result.availableAt ?? null, nickname: newName });
}
