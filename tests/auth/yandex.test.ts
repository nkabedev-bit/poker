import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthorizeUrl, exchangeCodeForToken, fetchYandexUser } from "@/lib/auth/yandex";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Yandex authorize link", () => {
  it("asks for a code, with the state that comes back for checking", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "client-1",
        redirectUri: "https://club.example/api/auth/yandex/callback",
        state: "one-off",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://oauth.yandex.ru/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("state")).toBe("one-off");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://club.example/api/auth/yandex/callback",
    );
    expect(url.searchParams.get("scope")).toContain("login:email");
  });
});

describe("trading the code for a token", () => {
  it("posts the code as a form and returns the token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ access_token: "token-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      exchangeCodeForToken({ clientId: "client-1", clientSecret: "secret", code: "code-1" }),
    ).resolves.toBe("token-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth.yandex.ru/token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("grant_type=authorization_code");
    expect(String(init.body)).toContain("code=code-1");
  });

  it("returns nothing when Yandex refuses the code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{\"error\":\"invalid_grant\"}", { status: 400 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      exchangeCodeForToken({ clientId: "client-1", clientSecret: "secret", code: "stale" }),
    ).resolves.toBeNull();
  });
});

describe("asking Yandex who signed in", () => {
  it("reads the account, the email and the photo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          default_avatar_id: "avatar-1",
          default_email: "player@yandex.ru",
          id: "42",
          is_avatar_empty: false,
          login: "player",
          real_name: "Дмитрий Б",
        }),
      ),
    );

    await expect(fetchYandexUser("token-1")).resolves.toEqual({
      avatarUrl: "https://avatars.yandex.net/get-yapic/avatar-1/islands-200",
      email: "player@yandex.ru",
      id: "42",
      login: "player",
      realName: "Дмитрий Б",
    });
  });

  // The club's own lettered plate beats the grey silhouette Yandex draws for an account
  // that never set a photo.
  it("takes no photo from an account that has none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ default_avatar_id: "avatar-1", id: "42", is_avatar_empty: true }),
      ),
    );

    await expect(fetchYandexUser("token-1")).resolves.toMatchObject({ avatarUrl: null });
  });

  it("returns nothing when the token is no good", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(fetchYandexUser("stale")).resolves.toBeNull();
  });
});
