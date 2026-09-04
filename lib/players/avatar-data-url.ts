/**
 * Reads the picture out of the data URL the mini-app sends after the player picks a
 * file. Kept apart from the upload itself so it can be tested without pulling in the
 * server-only image tooling.
 */
export function parseAvatarDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,([\s\S]+)$/.exec(String(dataUrl ?? "").trim());
  if (!match) return null;

  const bytes = Buffer.from(match[2], "base64");
  return bytes.byteLength > 0 ? bytes : null;
}
