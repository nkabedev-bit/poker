const AVATAR_SIZE = 160;
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const AVATAR_BUCKET = "player-avatars";
export const AVATAR_PIXEL_SIZE = AVATAR_SIZE;

export type TelegramPhotoSize = { file_id: string; height: number; width: number };

/**
 * A player's photo is re-fetched at most once a week: often enough that a changed
 * avatar catches up, rare enough that a chatty player does not cost a download on
 * every message.
 */
export function shouldRefreshAvatar(syncedAt: string | null, now: Date) {
  if (!syncedAt) return true;

  const previous = new Date(syncedAt).getTime();
  if (!Number.isFinite(previous)) return true;

  return now.getTime() - previous >= REFRESH_INTERVAL_MS;
}

/** The smallest size that still fills the avatar circle, or the largest available. */
export function pickAvatarPhotoSize(sizes: TelegramPhotoSize[]) {
  const sorted = [...sizes].sort((a, b) => a.width - b.width);
  return sorted.find((size) => size.width >= AVATAR_SIZE) ?? sorted.at(-1) ?? null;
}
