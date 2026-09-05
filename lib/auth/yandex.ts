import "server-only";

/**
 * Signing in with Yandex ID.
 *
 * Chosen for the web because it needs no domain of the club's own and no VPN. The flow
 * is the plain authorization-code one: send the player to Yandex, take the code they
 * come back with, trade it for a token behind the server's back, and ask Yandex who
 * they are. Endpoints are as documented at yandex.ru/dev/id.
 */
const AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const TOKEN_URL = "https://oauth.yandex.ru/token";
const USER_INFO_URL = "https://login.yandex.ru/info?format=json";

/** Holds the one-off `state` between sending the player to Yandex and their return. */
export const OAUTH_STATE_COOKIE = "yandex_oauth_state";

/** What the club asks for: who they are, how to write to them, and a face for the lists. */
export const YANDEX_SCOPE = "login:info login:email login:avatar";

export type YandexUser = {
  avatarUrl: string | null;
  email: string | null;
  id: string;
  login: string | null;
  realName: string | null;
};

export function buildAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YANDEX_SCOPE,
    state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * The redirect Yandex sends the player back to. It has to match the one registered with
 * the application character for character, so it is built from one place rather than
 * from whatever host the request happened to arrive on.
 */
export function getRedirectUri() {
  const explicit = process.env.YANDEX_REDIRECT_URI?.trim();
  if (explicit) return explicit;

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}/api/auth/yandex/callback` : "";
}

export async function exchangeCodeForToken({
  clientId,
  clientSecret,
  code,
}: {
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<string | null> {
  const response = await fetch(TOKEN_URL, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

  if (!response.ok) {
    // The body carries `error` and `error_description`; it is logged rather than shown,
    // because it says nothing a player could act on.
    console.error("Yandex refused the code", response.status, await response.text());
    return null;
  }

  const payload = (await response.json()) as { access_token?: unknown };
  return typeof payload.access_token === "string" ? payload.access_token : null;
}

export async function fetchYandexUser(accessToken: string): Promise<YandexUser | null> {
  const response = await fetch(USER_INFO_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });

  if (!response.ok) {
    console.error("Yandex would not say who this is", response.status);
    return null;
  }

  const payload = (await response.json()) as {
    default_avatar_id?: unknown;
    default_email?: unknown;
    id?: unknown;
    is_avatar_empty?: unknown;
    login?: unknown;
    real_name?: unknown;
  };

  const id = String(payload.id ?? "");
  if (!id) return null;

  const avatarId = typeof payload.default_avatar_id === "string" ? payload.default_avatar_id : "";

  return {
    // The placeholder Yandex draws for an account with no photo is worth less than the
    // club's own lettered plate, so an empty avatar comes back as none at all.
    avatarUrl:
      avatarId && payload.is_avatar_empty !== true
        ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200`
        : null,
    email: typeof payload.default_email === "string" ? payload.default_email : null,
    id,
    login: typeof payload.login === "string" ? payload.login : null,
    realName: typeof payload.real_name === "string" ? payload.real_name : null,
  };
}
