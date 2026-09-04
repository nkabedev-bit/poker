import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AVATAR_BUCKET, AVATAR_THUMB_PIXEL_SIZE } from "@/lib/client-bot/avatar-policy";
import { parseAvatarDataUrl } from "@/lib/players/avatar-data-url";

/** A profile photo is shown in a small circle; anything larger is wasted bytes. */
const AVATAR_SIZE = 320;
export const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

export class AvatarUploadError extends Error {}

/**
 * Stores the photo a player chose and returns its public URLs.
 *
 * The picture is squared off and shrunk here rather than trusted as sent: a phone
 * photo is several megabytes and the profile shows it 40 pixels across. A thumbnail
 * goes with it for the lists, which draw the same face far smaller and many at a time.
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
  const source = sharp(parsed).rotate();
  const [bytes, thumbBytes] = await Promise.all([
    source.clone()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 88 })
      .toBuffer(),
    source.clone()
      .resize(AVATAR_THUMB_PIXEL_SIZE, AVATAR_THUMB_PIXEL_SIZE, {
        fit: "cover",
        position: "attention",
      })
      .webp({ quality: 78 })
      .toBuffer(),
  ]);

  // One path per player, overwritten: an old photo should not linger in the bucket.
  const path = `custom/${telegramId}.webp`;
  const thumbPath = `custom/thumbs/${telegramId}.webp`;
  const [{ error }, { error: thumbError }] = await Promise.all([
    supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, { contentType: "image/webp", upsert: true }),
    supabase.storage
      .from(AVATAR_BUCKET)
      .upload(thumbPath, thumbBytes, { contentType: "image/webp", upsert: true }),
  ]);

  if (error) throw error;
  if (thumbError) throw thumbError;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const { data: thumbData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(thumbPath);

  // The bucket caches by path, so a new photo at the same path needs a fresh query.
  const version = Date.now();
  return {
    thumbUrl: `${thumbData.publicUrl}?v=${version}`,
    url: `${data.publicUrl}?v=${version}`,
  };
}
