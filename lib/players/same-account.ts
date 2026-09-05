/**
 * Whether a row carrying a Telegram id belongs to the player looking at it.
 *
 * Comparing the two ids directly was right while every player had one. A player who
 * signed in on the web has none, and `null === null` made every other web player read
 * as themselves — their own face on somebody else's row in the rating, and "это вы"
 * against a stranger's name. An id answers this only when both sides have one; the
 * nickname settles the rest.
 */
export function isSameTelegramAccount(
  mine: number | null | undefined,
  theirs: number | null | undefined,
) {
  return typeof mine === "number" && mine > 0 && mine === theirs;
}
