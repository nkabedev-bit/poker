import { InputFile } from "grammy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bot: {
    api: {
      sendDocument: vi.fn(),
      sendMessage: vi.fn(),
      sendPhoto: vi.fn(),
      sendVideo: vi.fn(),
    },
  },
  recordClubAnnouncement: vi.fn(),
  requireTmaAuth: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("@/lib/client-bot/announcement-log", () => ({
  recordClubAnnouncement: mocks.recordClubAnnouncement,
}));
vi.mock("@/lib/client-bot/broadcast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-bot/broadcast")>()),
  getClientBot: () => mocks.bot,
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const { POST } = await import("@/app/api/tma/client-bot/broadcast/route");

/** The bot's subscribers, handed out a page at a time as Supabase does. */
function subscribers(count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({ chat_id: 5000 + index }));
  const query = {
    not: () => query,
    order: () => query,
    range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
    select: () => query,
  };

  return { from: () => query };
}

function broadcast(form: FormData) {
  return POST(new Request("http://localhost/api/tma/client-bot/broadcast", { body: form, method: "POST" }));
}

describe("POST /api/tma/client-bot/broadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.bot.api.sendMessage.mockResolvedValue({});
    mocks.bot.api.sendPhoto.mockResolvedValue({
      photo: [{ file_id: "photo-small" }, { file_id: "photo-large" }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Uploading the poster again for every subscriber took the broadcast past its time.
  it("uploads a picture once and sends everyone after it Telegram's own copy", async () => {
    mocks.requireTmaAuth.mockResolvedValue({ supabase: subscribers(3), userId: 1 });
    const form = new FormData();
    form.set("message", "Турнир в пятницу");
    form.append("attachments", new File([new Uint8Array([1, 2, 3])], "poster.jpg", { type: "image/jpeg" }));

    const response = await broadcast(form);

    expect(await response.json()).toEqual({ failed: 0, sent: 3, total: 3 });
    const inputs = mocks.bot.api.sendPhoto.mock.calls.map(([, input]) => input);
    expect(inputs[0]).toBeInstanceOf(InputFile);
    expect(inputs.slice(1)).toEqual(["photo-large", "photo-large"]);
    expect(mocks.bot.api.sendPhoto.mock.calls[0][2]).toEqual({ caption: "Турнир в пятницу" });
    expect(mocks.recordClubAnnouncement).toHaveBeenCalledWith(expect.anything(), "Турнир в пятницу");
  });

  // Past a thousand subscribers the newest were never read, and one by one a few hundred
  // already ran out of time.
  it("reaches every subscriber, past a thousand", async () => {
    mocks.requireTmaAuth.mockResolvedValue({ supabase: subscribers(1200), userId: 1 });
    const form = new FormData();
    form.set("message", "Турнир в пятницу");

    const pending = broadcast(form);
    await vi.advanceTimersByTimeAsync(60_000);
    const response = await pending;

    expect(await response.json()).toEqual({ failed: 0, sent: 1200, total: 1200 });
    expect(new Set(mocks.bot.api.sendMessage.mock.calls.map(([chatId]) => chatId)).size).toBe(1200);
  });
});
