/** One line the club said to everybody. */
export type Announcement = {
  createdAt: string;
  id: string;
  message: string;
};

/** How many of these the player has not seen; null means they have seen none of them. */
export function countUnreadAnnouncements(
  announcements: Array<Pick<Announcement, "createdAt">>,
  seenAt: string | null,
) {
  if (!seenAt) return announcements.length;

  const seen = new Date(seenAt).getTime();
  // An unreadable timestamp must not hide the news; treated as never opened.
  if (!Number.isFinite(seen)) return announcements.length;

  return announcements.filter((item) => new Date(item.createdAt).getTime() > seen).length;
}

/** The badge a nav item carries. Past nine it stops counting and starts nagging. */
export function formatUnreadBadge(count: number) {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}
