import { isOwnOriginMediaPath, STORAGE_PUBLIC_PATH } from "@/lib/media/own-origin-url";

/**
 * A file whose URL carries a version never changes — a new photo gets a new `?v=` —
 * so browsers and Vercel's CDN may keep it for good.
 */
const VERSIONED_CACHE = "public, max-age=31536000, s-maxage=31536000, immutable";

/** Unversioned files are kept for an hour, as Supabase itself hands them out. */
const UNVERSIONED_CACHE = "public, max-age=3600, s-maxage=3600";

/** Storage answers in well under a second; a request that hangs is given up on. */
const STORAGE_TIMEOUT_MS = 10_000;

/**
 * What the club keeps in these buckets: photos and the break sound. Anything else is
 * refused rather than served — a file on the club's own domain runs with its cookies,
 * so a stray HTML or SVG file must never reach a browser from here.
 */
const SERVED_TYPES = /^(image\/(jpeg|png|webp|gif|avif)|audio\/[\w.+-]+)$/;

/**
 * Serves the club's stored pictures and sounds from its own domain.
 *
 * Supabase serves them through Cloudflare, which Russian ISPs cut off after the first
 * 16 KB or so, so a player without a VPN — and the laptop driving the screen in the
 * hall — saw empty circles where the faces should be. Asked from here, the file is
 * fetched from Supabase on Vercel's side and arrives whole.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!isOwnOriginMediaPath(path)) return new Response(null, { status: 404 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return new Response(null, { status: 503 });

  // The version goes along: it is what makes Supabase's own cache hand out the new
  // photo rather than the one it kept under the same name. Nothing else is passed on.
  const version = new URL(request.url).searchParams.get("v");
  const query = version ? `?v=${encodeURIComponent(version)}` : "";
  const upstreamUrl = `${supabaseUrl.replace(/\/+$/, "")}${STORAGE_PUBLIC_PATH}${path.join("/")}${query}`;
  const bucket = path[0];

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Media proxy could not reach storage", { bucket, error });
    return new Response(null, { status: 502 });
  }

  // Supabase answers a missing file with 400 "not_found"; to the browser it is a 404.
  if (upstream.status === 400 || upstream.status === 404) {
    return new Response(null, { status: 404 });
  }

  if (!upstream.ok || !upstream.body) {
    console.error("Media proxy got a bad answer from storage", {
      bucket,
      status: upstream.status,
    });
    return new Response(null, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!SERVED_TYPES.test(contentType)) {
    console.error("Media proxy refused a file that is not a picture or a sound", {
      bucket,
      contentType,
    });
    return new Response(null, { status: 404 });
  }

  return new Response(upstream.body, {
    headers: {
      "Cache-Control": version ? VERSIONED_CACHE : UNVERSIONED_CACHE,
      // Opened on its own, the file is a sandboxed document that can run nothing.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
