/**
 * The one person who hands out free entries.
 *
 * Passes are money. The club owner asked to be taken off this list themselves: being
 * able to give one away is not the same as being the one who does it, and an owner who
 * cannot is an owner who cannot be talked into it.
 */
const FREE_ENTRY_MANAGER_ID = 384428007;

export function canManageFreeEntries(telegramId: number | undefined) {
  return telegramId === FREE_ENTRY_MANAGER_ID;
}

export type FreeEntryCommand = {
  count: number;
  nickname: string;
};

const MAX_PASSES_PER_COMMAND = 50;

/**
 * Reads "/free Старый узбек 3" and its /delete free twin.
 *
 * Club nicknames contain spaces, so the parts are recognised by shape rather than by
 * position: a trailing number is how many, and everything before it is the nickname.
 * Without a number it is one pass.
 */
export function parseFreeEntryCommand(text: string): FreeEntryCommand | null {
  const withoutCommand = text
    .trim()
    .replace(/^\/(?:delete\s*free|deletefree|free)(?:@\S+)?\s*/i, "");

  if (!withoutCommand) return null;

  const parts = withoutCommand.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1];
  const trailingNumber = /^\d+$/.test(last) ? Number(last) : null;
  // A nickname made only of digits exists in this club ("123"), so a lone number is the
  // player, not the count.
  const countIsGiven = trailingNumber !== null && parts.length > 1;
  const nicknameParts = countIsGiven ? parts.slice(0, -1) : parts;
  const nickname = nicknameParts.join(" ").trim();

  if (!nickname) return null;

  return {
    count: Math.min(MAX_PASSES_PER_COMMAND, Math.max(1, countIsGiven ? trailingNumber : 1)),
    nickname,
  };
}

/** "3 проходки", "1 проходка" — for the confirmations the bot sends back. */
export function describeFreeEntries(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (last === 1 && lastTwo !== 11) return `${count} проходка`;
  if (last >= 2 && last <= 4 && (lastTwo < 10 || lastTwo >= 20)) return `${count} проходки`;

  return `${count} проходок`;
}
