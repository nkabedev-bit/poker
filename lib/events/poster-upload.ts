import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLogoDataUrl, prepareLogoImage } from "@/lib/admin/logo-upload";

const POSTER_BUCKET = "tournament-logos";
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;

export class PosterUploadError extends Error {}

/**
 * Stores a poster sent as a data URL (the mini-app reads the file with FileReader)
 * and returns its public URL. Images are normalised the same way tournament logos
 * are, so a phone photo does not land in the bucket at full size.
 */
export async function uploadEventPosterDataUrl(
  supabase: SupabaseClient,
  dataUrl: string,
): Promise<string> {
  const parsed = parseLogoDataUrl({ dataUrl, name: "poster.png", type: "image/png" });
  if (!parsed) throw new PosterUploadError("Не удалось прочитать изображение афиши");

  if (parsed.bytes.byteLength > MAX_POSTER_BYTES) {
    throw new PosterUploadError("Афиша больше 5 МБ — уменьшите файл");
  }

  const bytes = await prepareLogoImage(parsed.bytes);
  const path = `events/${randomUUID()}.png`;

  const { error } = await supabase.storage
    .from(POSTER_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });

  if (error) throw error;

  return supabase.storage.from(POSTER_BUCKET).getPublicUrl(path).data.publicUrl;
}
