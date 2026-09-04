import { NextResponse } from "next/server";
import { requireClientTmaAuth } from "@/lib/client-tma/require-auth";
import { AvatarUploadError, uploadPlayerAvatar } from "@/lib/players/avatar-upload";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Stores the photo a player chose for their profile. */
export async function POST(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  try {
    const avatarUrl = await uploadPlayerAvatar(auth.supabase, {
      dataUrl: String(body.dataUrl ?? ""),
      telegramId: auth.user.telegram_id,
    });

    // Marked as the player's own, so the weekly Telegram sync leaves it alone.
    const { error } = await auth.supabase
      .from("client_bot_users")
      .update({
        avatar_is_custom: true,
        avatar_synced_at: new Date().toISOString(),
        avatar_url: avatarUrl,
      })
      .eq("telegram_id", auth.user.telegram_id);

    if (error) {
      const missingColumn = String(error.message ?? "").includes("avatar_is_custom");

      return NextResponse.json(
        {
          error: missingColumn
            ? "Миграция 202609040004 не применена — фото не сохраняется"
            : (error.message ?? "Не удалось сохранить фото"),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ avatarUrl });
  } catch (error) {
    if (error instanceof AvatarUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Failed to store a profile photo", error);
    return NextResponse.json({ error: "Не удалось сохранить фото" }, { status: 500 });
  }
}

/** Goes back to the Telegram photo: the next sync fetches it again. */
export async function DELETE(request: Request) {
  const auth = await requireClientTmaAuth(request);
  if (auth.error) return auth.error;

  const { error } = await auth.supabase
    .from("client_bot_users")
    .update({ avatar_is_custom: false, avatar_synced_at: null, avatar_url: null })
    .eq("telegram_id", auth.user.telegram_id);

  if (error) throw error;

  return NextResponse.json({ avatarUrl: null });
}
