export type FreeEntryCommand = {
  count: number;
  nickname: string;
  vip: boolean;
};

const MAX_PASSES_PER_COMMAND = 50;

/**
 * Reads "/free vip Старый узбек 3" and its /delete free twin.
 *
 * Club nicknames contain spaces, so the parts are recognised by shape rather than by
 * position: "vip" right after the command marks the ticket type, a trailing number is
 * how many, and everything in between is the nickname. Without a number it is one pass.
 */
export function parseFreeEntryCommand(text: string): FreeEntryCommand | null {
  const withoutCommand = text
    .trim()
    .replace(/^\/(?:delete\s*free|deletefree|free)(?:@\S+)?\s*/i, "");

  if (!withoutCommand) return null;

  const parts = withoutCommand.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const vip = parts[0].toLocaleLowerCase("ru-RU") === "vip";
  const rest = vip ? parts.slice(1) : parts;
  if (rest.length === 0) return null;

  const last = rest[rest.length - 1];
  const trailingNumber = /^\d+$/.test(last) ? Number(last) : null;
  // A nickname made only of digits exists in this club ("123"), so a lone number is the
  // player, not the count.
  const countIsGiven = trailingNumber !== null && rest.length > 1;
  const nicknameParts = countIsGiven ? rest.slice(0, -1) : rest;
  const nickname = nicknameParts.join(" ").trim();

  if (!nickname) return null;

  return {
    count: Math.min(MAX_PASSES_PER_COMMAND, Math.max(1, countIsGiven ? trailingNumber : 1)),
    nickname,
    vip,
  };
}

/** "3 VIP-проходки", "1 проходка" — for the confirmations the bot sends back. */
export function describeFreeEntries(count: number, vip: boolean) {
  const prefix = vip ? "VIP-" : "";
  const lastTwo = count % 100;
  const last = count % 10;

  if (last === 1 && lastTwo !== 11) return `${count} ${prefix}проходка`;
  if (last >= 2 && last <= 4 && (lastTwo < 10 || lastTwo >= 20)) return `${count} ${prefix}проходки`;

  return `${count} ${prefix}проходок`;
}
