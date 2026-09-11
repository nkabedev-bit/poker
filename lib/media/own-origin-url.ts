/** Where Supabase serves a public bucket's files, after the project URL. */
export const STORAGE_PUBLIC_PATH = "/storage/v1/object/public/";

/** Where the club serves the same files from its own domain. */
export const OWN_ORIGIN_MEDIA_PREFIX = "/media/";

/**
 * The public buckets the club keeps pictures and sounds in: faces, tournament logos
 * and posters, and the break sound. Only these are served through the club's domain.
 */
const OWN_ORIGIN_MEDIA_BUCKETS: readonly string[] = [
  "player-avatars",
  "tournament-logos",
  "tournament-sounds",
];

/**
 * Plain file and folder names, which is all the club ever stores: nothing that could
 * step out of a bucket.
 */
const SAFE_SEGMENT = /^[\w-][\w.-]*$/;

/**
 * Whether a storage path — bucket first, then folders and the file — is one the club
 * serves from its own domain. The /media route refuses everything else, and the URLs
 * handed to the browser are only rewritten when this holds, so the two always agree.
 */
export function isOwnOriginMediaPath(segments: readonly string[]) {
  const [bucket, ...rest] = segments;

  return (
    OWN_ORIGIN_MEDIA_BUCKETS.includes(bucket) &&
    rest.length > 0 &&
    rest.every((segment) => SAFE_SEGMENT.test(segment))
  );
}

/**
 * The address the browser should load a stored file from.
 *
 * Supabase serves its files through Cloudflare, and Russian ISPs let only the first
 * 16 KB or so of a Cloudflare connection through: the rest of the picture never
 * arrives, and the request hangs instead of failing. The same file asked of the club's
 * own domain arrives whole — the /media route fetches it from Supabase on the server,
 * where nothing is cut. Stored URLs stay as they are; they are only rewritten here, on
 * the way to an <img>.
 *
 * Anything else — a Telegram photo, a data URL being previewed, a picture in public/,
 * a file in a bucket the club does not serve — is returned untouched.
 */
export function toOwnOriginMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return url;

  const storagePrefix = `${supabaseUrl.replace(/\/+$/, "")}${STORAGE_PUBLIC_PATH}`;
  if (!url.startsWith(storagePrefix)) return url;

  const pathAndQuery = url.slice(storagePrefix.length);
  const path = pathAndQuery.split("?", 1)[0];
  if (!isOwnOriginMediaPath(path.split("/"))) return url;

  return `${OWN_ORIGIN_MEDIA_PREFIX}${pathAndQuery}`;
}
