import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  requireClientTmaAuth: vi.fn(),
  setNotificationsInClientBotProfileSheet: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({ requireClientTmaAuth: mocks.requireClientTmaAuth }));
vi.mock("@/lib/google-sheets", () => ({
  setNotificationsInClientBotProfileSheet: mocks.setNotificationsInClientBotProfileSheet,
}));
vi.mock("next/server", () => ({
  after: mocks.after,
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const ANSWERS = {
  birthDate: "05.07.1990",
  fullName: "Иван Иванов",
  nickname: "Chura",
  notificationsConsent: false,
  phone: "+79990000000",
  ratingConsent: true,
};

/** The accounts table with one questionnaire in it, recording what is written back. */
function accountsSpy(answers: Record<string, unknown> | null = ANSWERS) {
  const writes: Array<Record<string, unknown>> = [];
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { pending_profile_answers: answers }, error: null }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          writes.push(values);
          return { error: null };
        },
      }),
    }),
  };

  return { supabase, writes };
}

async function switchNotifications(enabled: unknown) {
  const { POST } = await import("@/app/api/client-tma/notifications/route");
  return POST(
    new Request("http://localhost/api/client-tma/notifications", {
      body: JSON.stringify({ enabled }),
      method: "POST",
    }),
  );
}

describe("switching the club's broadcasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("changes the answer and keeps the rest of the questionnaire", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "me", telegram_id: 101 } });

    const response = await switchNotifications(true);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(writes).toEqual([{ pending_profile_answers: { ...ANSWERS, notificationsConsent: true } }]);
  });

  // A player who never filled the questionnaire in still gets the broadcasts, and may
  // turn them off before they do.
  it("stores a refusal for a player without a questionnaire", async () => {
    const { supabase, writes } = accountsSpy(null);
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "me", telegram_id: 101 } });

    await switchNotifications(false);

    expect(writes).toEqual([{ pending_profile_answers: { notificationsConsent: false } }]);
  });

  it("turns away anything but on or off", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "me", telegram_id: 101 } });

    const response = await switchNotifications("yes");

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("writes the answer into the club's sheet after the reply", async () => {
    const { supabase } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "me", telegram_id: 101 } });

    await switchNotifications(false);
    expect(mocks.setNotificationsInClientBotProfileSheet).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();

    expect(mocks.setNotificationsInClientBotProfileSheet).toHaveBeenCalledWith({
      enabled: false,
      telegramId: 101,
    });
  });

  // The database is what the bot goes by: a sheet that will not take the write changes nothing.
  it("keeps the answer when the sheet cannot be written", async () => {
    const { supabase, writes } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "me", telegram_id: 101 } });
    mocks.setNotificationsInClientBotProfileSheet.mockRejectedValue(new Error("quota"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await switchNotifications(true);

    expect(response.status).toBe(200);
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(writes).toHaveLength(1);
  });

  it("leaves the sheet alone for a player with no Telegram", async () => {
    const { supabase } = accountsSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: { id: "me", telegram_id: null } });

    await switchNotifications(true);

    expect(mocks.after).not.toHaveBeenCalled();
  });
});
