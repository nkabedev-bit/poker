/**
 * The picture to show for a player.
 *
 * A photo the player uploaded is theirs and wins outright; otherwise Telegram's own
 * photo is used, falling back to the copy the club stored when the mini-app was opened
 * without one.
 */
export function pickPlayerPhoto({
  avatarIsCustom,
  avatarUrl,
  telegramPhotoUrl,
}: {
  avatarIsCustom?: boolean | null;
  avatarUrl?: string | null;
  telegramPhotoUrl?: string | null;
}) {
  if (avatarIsCustom && avatarUrl) return avatarUrl;

  return telegramPhotoUrl ?? avatarUrl ?? undefined;
}
