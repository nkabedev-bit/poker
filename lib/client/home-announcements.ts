/** One card of the "Объявление клуба" carousel on the players' home screen. */
export type HomeAnnouncement = {
  id: string;
  /** Where tapping the card leads; null leaves it a plain note. */
  linkUrl: string | null;
  message: string;
};

/** The same card as the desk edits it, with the moment it stops being shown. */
export type HomeAnnouncementDraft = HomeAnnouncement & {
  /** ISO timestamp; null keeps the card up until somebody deletes it. */
  showUntil: string | null;
};

/** A card as the desk sent it: no id yet means it is new. */
export type HomeAnnouncementInput = Omit<HomeAnnouncementDraft, "id"> & { id: string | null };

export const HOME_ANNOUNCEMENT_MAX_LENGTH = 500;
export const HOME_ANNOUNCEMENTS_LIMIT = 10;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A card past its end of showing is kept for the desk but no longer reaches players. */
export function isHomeAnnouncementShown(item: Pick<HomeAnnouncementDraft, "showUntil">, now: Date) {
  if (!item.showUntil) return true;
  return new Date(item.showUntil).getTime() > now.getTime();
}

/**
 * Reads a link the way the desk types it. A bare "t.me/…" gets its https:// back; anything
 * that is not a web address is refused, since the link lands in an href and in Telegram's
 * own opener.
 */
function readLink(raw: unknown): { url: string | null } | { error: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { url: null };

  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "ссылка не похожа на адрес сайта" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "ссылка должна начинаться с https://" };
  }
  if (!url.hostname.includes(".")) return { error: "ссылка не похожа на адрес сайта" };
  if (url.href.length > HOME_ANNOUNCEMENT_MAX_LENGTH) return { error: "ссылка слишком длинная" };

  return { url: url.href };
}

function readShowUntil(raw: unknown): { showUntil: string | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { showUntil: null };

  const time = typeof raw === "string" ? new Date(raw).getTime() : Number.NaN;
  if (!Number.isFinite(time)) return { error: "непонятная дата окончания показа" };

  return { showUntil: new Date(time).toISOString() };
}

/**
 * Checks the whole list the desk saves, in the order it is shown. Errors name the card by
 * its place in the list, the way the desk sees it.
 */
export function parseHomeAnnouncementsInput(
  body: unknown,
): { items: HomeAnnouncementInput[] } | { error: string } {
  const list = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) return { error: "Нет списка объявлений" };
  if (list.length > HOME_ANNOUNCEMENTS_LIMIT) {
    return { error: `Не больше ${HOME_ANNOUNCEMENTS_LIMIT} объявлений` };
  }

  const seenIds = new Set<string>();
  const items: HomeAnnouncementInput[] = [];

  for (const [index, raw] of list.entries()) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const name = `Объявление ${index + 1}`;

    const message = typeof entry.message === "string" ? entry.message.trim() : "";
    if (!message) return { error: `${name}: пустой текст` };
    if (message.length > HOME_ANNOUNCEMENT_MAX_LENGTH) {
      return { error: `${name}: текст длиннее ${HOME_ANNOUNCEMENT_MAX_LENGTH} символов` };
    }

    const link = readLink(entry.linkUrl);
    if ("error" in link) return { error: `${name}: ${link.error}` };

    const until = readShowUntil(entry.showUntil);
    if ("error" in until) return { error: `${name}: ${until.error}` };

    // An id the store has never handed out, or one already used above, makes a new card
    // rather than overwriting somebody else's.
    const id = typeof entry.id === "string" && UUID_PATTERN.test(entry.id) && !seenIds.has(entry.id)
      ? entry.id
      : null;
    if (id) seenIds.add(id);

    items.push({ id, linkUrl: link.url, message, showUntil: until.showUntil });
  }

  return { items };
}
