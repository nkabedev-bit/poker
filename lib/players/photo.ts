/**
 * The picture to show for a player.
 *
 * The club's stored copy wins. It is served from the club's own domain, while the photo
 * Telegram hands the mini-app lives on t.me, which Russian ISPs filter like telegram.org:
 * without a VPN the request hangs and the player gets an empty circle for a face. A
 * photo uploaded in the app is a stored copy too, so it shows at once; one changed in
 * Telegram catches up at the weekly sync. Telegram's own photo is for a player the club
 * has no copy of yet.
 */
export function pickPlayerPhoto({
  avatarUrl,
  telegramPhotoUrl,
}: {
  avatarUrl?: string | null;
  telegramPhotoUrl?: string | null;
}) {
  return avatarUrl || telegramPhotoUrl || undefined;
}
