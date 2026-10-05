import { relayTargetPath } from "@/lib/telegram/relay-path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Always Telegram itself — never TELEGRAM_API_ROOT, which on the club's own server
 * points back here.
 */
const TELEGRAM_API = "https://api.telegram.org";

/** A broadcast photo upload is the slowest thing that passes through. */
const TELEGRAM_TIMEOUT_MS = 50_000;

/**
 * Forwards the club bots' Bot API calls to Telegram.
 *
 * The club's server in Russia cannot reach api.telegram.org, but it can reach Vercel,
 * and Vercel can reach Telegram. So that server sends its bot calls here, on the same
 * paths Telegram uses, and gets Telegram's answer back unchanged.
 */
async function relay(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = relayTargetPath(path, [
    process.env.TELEGRAM_BOT_TOKEN ?? "",
    process.env.CLIENT_TELEGRAM_BOT_TOKEN ?? "",
  ]);
  if (!target) return new Response(null, { status: 404 });

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(`${TELEGRAM_API}/${target}${new URL(request.url).search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch {
    // Shaped like a Bot API error, so grammY on the other end reports it as one.
    return Response.json(
      { ok: false, error_code: 504, description: "Relay could not reach Telegram" },
      { status: 504 },
    );
  }

  const answerHeaders = new Headers();
  const answerType = upstream.headers.get("content-type");
  if (answerType) answerHeaders.set("content-type", answerType);

  return new Response(upstream.body, { status: upstream.status, headers: answerHeaders });
}

export { relay as GET, relay as POST };
