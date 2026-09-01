import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AVATAR_BUCKET,
  AVATAR_PIXEL_SIZE,
  pickAvatarPhotoSize,
  type TelegramPhotoSize,
} from "@/lib/client-bot/avatar-policy";

async function telegramApi<T>(token: string, method: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}?${query}`);
  if (!res.ok) throw new Error(`Telegram ${method} failed with ${res.status}`);

  const payload = (await res.json()) as { ok: boolean; result?: T };
  if (!payload.ok) throw new Error(`Telegram ${method} returned ok: false`);

  return payload.result;
}

/**
 * Downloads the player's Telegram profile photo and stores it, returning the public
 * URL. Returns null when the player has no photo or hid it behind privacy settings —
 * that is an ordinary outcome, not a failure.
 */
export async function syncClientBotAvatar({
  supabase,
  telegramId,
  token,
}: {
  supabase: SupabaseClient;
  telegramId: number;
  token: string;
}): Promise<string | null> {
  const photos = await telegramApi<{ photos: TelegramPhotoSize[][] }>(
    token,
    "getUserProfilePhotos",
    { limit: "1", user_id: String(telegramId) },
  );

  const size = pickAvatarPhotoSize(photos?.photos?.[0] ?? []);
  const syncedAt = new Date().toISOString();

  if (!size) {
    // Remember the attempt so a photoless player is not retried on every message.
    await supabase
      .from("client_bot_users")
      .update({ avatar_synced_at: syncedAt })
      .eq("telegram_id", telegramId);
    return null;
  }

  const file = await telegramApi<{ file_path?: string }>(token, "getFile", {
    file_id: size.file_id,
  });
  if (!file?.file_path) return null;

  const download = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!download.ok) throw new Error(`Avatar download failed with ${download.status}`);

  const sharp = (await import("sharp")).default;
  const bytes = await sharp(Buffer.from(await download.arrayBuffer()))
    .resize(AVATAR_PIXEL_SIZE, AVATAR_PIXEL_SIZE, { fit: "cover" })
    .jpeg({ quality: 82 })
    .toBuffer();

  const path = `${telegramId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: true });

  if (uploadError) throw uploadError;

  // The path stays the same across updates, so the URL carries the sync time to keep
  // a replaced photo from hiding behind a cached copy of the old one.
  const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  const avatarUrl = `${publicUrl}?v=${Date.parse(syncedAt)}`;

  const { error } = await supabase
    .from("client_bot_users")
    .update({ avatar_synced_at: syncedAt, avatar_url: avatarUrl })
    .eq("telegram_id", telegramId);

  if (error) throw error;

  return avatarUrl;
}
