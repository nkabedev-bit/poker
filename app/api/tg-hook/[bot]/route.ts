export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The club's own server, where the bots' code runs after the move off Vercel. */
const CLUB_ORIGIN = "https://pokerptz.ru";

/** Where on the club's server each bot takes its updates. */
const WEBHOOK_PATHS: Record<string, string> = {
  admin: "/api/bot/webhook",
  client: "/api/client-bot/webhook",
};

/** The only headers Telegram's call carries that the webhook needs. */
const FORWARDED_HEADERS = ["content-type", "x-telegram-bot-api-secret-token"];

/** Under Telegram's own patience for a webhook answer. */
const FORWARD_TIMEOUT_MS = 50_000;

/**
 * Passes Telegram's webhook calls on to the club's server.
 *
 * Russian networks drop traffic between Telegram's addresses and servers in Russia in both
 * directions, so Telegram cannot deliver updates to the club's server itself. It can
 * deliver them here, and Vercel can reach the club's server. The update and the secret
 * header Telegram signs it with go through untouched — the server checks the secret, as
 * it always has.
 */
export async function POST(request: Request, { params }: { params: Promise<{ bot: string }> }) {
  const { bot } = await params;
  const path = Object.hasOwn(WEBHOOK_PATHS, bot) ? WEBHOOK_PATHS[bot] : undefined;
  if (!path) return new Response(null, { status: 404 });

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let answer: Response;
  try {
    answer = await fetch(`${CLUB_ORIGIN}${path}`, {
      method: "POST",
      headers,
      body: await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
    });
  } catch {
    // Telegram delivers a failed update again later, so nothing is lost while the
    // club's server is out of reach.
    return new Response(null, { status: 502 });
  }

  const answerHeaders = new Headers();
  const answerType = answer.headers.get("content-type");
  if (answerType) answerHeaders.set("content-type", answerType);

  return new Response(answer.body, { status: answer.status, headers: answerHeaders });
}
