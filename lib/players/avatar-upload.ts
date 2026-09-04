import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET } from "@/lib/client-bot/avatar-policy";
import { parseAvatarDataUrl } from "@/lib/players/avatar-data-url";

/** A profile photo is shown in a small circle; anything larger is wasted bytes. */
const AVATAR_SIZE = 320;
export const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

export class AvatarUploadError extends Error {}

/**
 * Stores the photo a player chose and returns its public URL.
 *
 * The picture is squared off and shrunk here rather than trusted as sent: a phone
 * photo is several megabytes and the profile shows it 40 pixels across.
 */
export async function uploadPlayerAvatar(
  supabase: SupabaseClient,
  { dataUrl, telegramId }: { dataUrl: string; telegramId: number },
) {
  const parsed = parseAvatarDataUrl(dataUrl);
  if (!parsed) throw new AvatarUploadError("Не удалось прочитать изображение");

  if (parsed.byteLength > MAX_AVATAR_BYTES) {
    throw new AvatarUploadError("Фото больше 8 МБ — выберите другое");
  }

  const sharp = (await import("sharp")).default;
  const bytes = await sharp(parsed)
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
    .webp({ quality: 88 })
    .toBuffer();

  // One path per player, overwritten: an old photo should not linger in the bucket.
  const path = `custom/${telegramId}.webp`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, bytes, { contentType: "image/webp", upsert: true });

  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  // The bucket caches by path, so a new photo at the same path needs a fresh query.
  return `${data.publicUrl}?v=${Date.now()}`;
}
