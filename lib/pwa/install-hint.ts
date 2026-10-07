/**
 * Which "put the club on your home screen" hint a player should see, if any.
 *
 * - telegram: inside the mini-app — the app installs from a browser, so the hint sends
 *   the player there; once installed it opens without Telegram, and so without a VPN.
 * - prompt: the browser offered its own install dialog (Chrome on Android, desktop).
 * - ios: an iPhone or iPad browser, which never offers one: the player is shown where
 *   «На экран „Домой“» lives.
 * - menu: any other browser — the install item is in its menu, if it has one.
 * - none: already installed, or the player closed the hint recently.
 */
export type InstallHint = "telegram" | "prompt" | "ios" | "menu" | "none";

export function chooseInstallHint({
  canPrompt,
  dismissed,
  inTelegram,
  isIos,
  standalone,
}: {
  canPrompt: boolean;
  dismissed: boolean;
  inTelegram: boolean;
  isIos: boolean;
  standalone: boolean;
}): InstallHint {
  if (standalone || dismissed) return "none";
  if (inTelegram) return "telegram";
  if (canPrompt) return "prompt";
  if (isIos) return "ios";
  return "menu";
}

/** iPhone, iPad, and an iPad asking for the desktop site (it calls itself a Mac). */
export function isIosDevice(userAgent: string, maxTouchPoints: number) {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** How long a closed hint stays closed before it is offered again. */
export const INSTALL_HINT_SNOOZE_MS = 30 * 24 * 60 * 60_000;

export const INSTALL_HINT_DISMISSED_KEY = "club:install-hint-dismissed-at";

export function isHintSnoozed(dismissedAt: string | null, now: number) {
  const at = Number(dismissedAt);
  return Number.isFinite(at) && at > 0 && now - at < INSTALL_HINT_SNOOZE_MS;
}
