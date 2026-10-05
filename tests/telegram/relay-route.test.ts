import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/tg-relay/[...path]/route";

const ADMIN_TOKEN = "111:admin-token";
const CLIENT_TOKEN = "222:client_token";

const fetchMock = vi.fn();

function params(path: string) {
  return { params: Promise.resolve({ path: path.split("/") }) };
}

describe("/api/tg-relay/[...path]", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", ADMIN_TOKEN);
    vi.stubEnv("CLIENT_TELEGRAM_BOT_TOKEN", CLIENT_TOKEN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("forwards a method call to Telegram and hands its answer back unchanged", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"ok":true,"result":{"message_id":7}}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const path = `bot${CLIENT_TOKEN}/sendMessage`;

    const response = await POST(
      new Request(`https://club.example/api/tg-relay/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "session=secret" },
        body: '{"chat_id":1,"text":"hi"}',
      }),
      params(path),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${CLIENT_TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body)).toBe('{"chat_id":1,"text":"hi"}');
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(init.headers.get("cookie")).toBeNull();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.text()).toBe('{"ok":true,"result":{"message_id":7}}');
  });

  it("passes the query along for a GET call and Telegram's error status back", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"ok":false,"error_code":400}', {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const path = `bot${ADMIN_TOKEN}/getUserProfilePhotos`;

    const response = await GET(
      new Request(`https://club.example/api/tg-relay/${path}?user_id=42&limit=1`),
      params(path),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${ADMIN_TOKEN}/getUserProfilePhotos?user_id=42&limit=1`);
    expect(init.body).toBeUndefined();
    expect(response.status).toBe(400);
  });

  it("downloads a file the same way", async () => {
    fetchMock.mockResolvedValue(
      new Response("jpeg-bytes", { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    const path = `file/bot${CLIENT_TOKEN}/photos/file_3.jpg`;

    const response = await GET(new Request(`https://club.example/api/tg-relay/${path}`), params(path));

    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.telegram.org/file/bot${CLIENT_TOKEN}/photos/file_3.jpg`,
    );
    expect(await response.text()).toBe("jpeg-bytes");
  });

  it("refuses a stranger's bot without calling Telegram", async () => {
    const path = "bot999:stranger/sendMessage";

    const response = await POST(
      new Request(`https://club.example/api/tg-relay/${path}`, { method: "POST", body: "{}" }),
      params(path),
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers like the Bot API when Telegram cannot be reached", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    const path = `bot${ADMIN_TOKEN}/getMe`;

    const response = await GET(new Request(`https://club.example/api/tg-relay/${path}`), params(path));

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      ok: false,
      error_code: 504,
      description: "Relay could not reach Telegram",
    });
  });
});
