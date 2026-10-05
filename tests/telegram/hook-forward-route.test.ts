import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tg-hook/[bot]/route";

const fetchMock = vi.fn();

function update(bot: string, init: RequestInit = {}) {
  return POST(
    new Request(`https://relay.example/api/tg-hook/${bot}`, {
      method: "POST",
      body: '{"update_id":1}',
      ...init,
    }),
    { params: Promise.resolve({ bot }) },
  );
}

describe("POST /api/tg-hook/[bot]", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the admin bot's update to its webhook on the club's server", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    const response = await update("admin", {
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "s3cret",
        cookie: "session=secret",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://pokerptz.ru/api/bot/webhook");
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body)).toBe('{"update_id":1}');
    expect(init.headers.get("x-telegram-bot-api-secret-token")).toBe("s3cret");
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(init.headers.get("cookie")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("sends the players' bot to its own webhook", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 200 }));

    await update("client");

    expect(fetchMock.mock.calls[0][0]).toBe("https://pokerptz.ru/api/client-bot/webhook");
  });

  it("passes the server's refusal back, so a wrong secret still fails", async () => {
    fetchMock.mockResolvedValue(new Response("secret token is wrong", { status: 401 }));

    const response = await update("client", { headers: { "x-telegram-bot-api-secret-token": "nope" } });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("secret token is wrong");
  });

  it("refuses a bot it does not know without calling the server", async () => {
    const response = await update("stranger");

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Telegram to try again later when the server is out of reach", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));

    const response = await update("admin");

    expect(response.status).toBe(502);
  });
});
