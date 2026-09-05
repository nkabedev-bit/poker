import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendClientBotProfileRow: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/google-sheets", () => ({
  appendClientBotProfileRow: mocks.appendClientBotProfileRow,
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

/** The accounts table, answering one question: is this nickname somebody else's. */
function supabaseSpy({ taken = false } = {}) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const chain = {
    eq: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: taken ? [{ id: "account-other" }] : [], error: null })),
    neq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    update,
  };

  return { supabase: { from: vi.fn(() => chain) }, update };
}

const FORM = {
  agreementAccepted: true,
  birthDate: "15.04.2003",
  discoverySource: "Друзья",
  fullName: "Егор Щ",
  nickname: "1$",
  notificationsConsent: true,
  phone: "89116642324",
  ratingConsent: true,
};

async function submit(body: Record<string, unknown> = FORM) {
  const { POST } = await import("@/app/api/client-tma/profile/route");
  return POST(
    new Request("http://localhost/api/client-tma/profile", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}

describe("filling in the questionnaire", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.appendClientBotProfileRow.mockResolvedValue({ sheetName: "анкеты" });
  });

  it("stores the profile under the nickname the player chose", async () => {
    const { supabase, update } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: { id: "account-me", profile_submitted_at: null, telegram_id: 555, username: null },
    });

    const response = await submit();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ display_name: "1$" }));
  });

  // A member who already has an account and answers "нет, я впервые" out of habit would
  // otherwise end up with two profiles under one name.
  it("refuses a nickname another account already holds", async () => {
    const { supabase, update } = supabaseSpy({ taken: true });
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: { id: "account-me", profile_submitted_at: null, telegram_id: null, username: null },
    });

    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "nickname_taken" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a second questionnaire from a player who filled one in", async () => {
    const { supabase, update } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: {
        id: "account-me",
        profile_submitted_at: "2026-08-01T00:00:00.000Z",
        telegram_id: 555,
        username: null,
      },
    });

    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "already_submitted" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a birth date that is not one", async () => {
    const { supabase, update } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: { id: "account-me", profile_submitted_at: null, telegram_id: 555, username: null },
    });

    const response = await submit({ ...FORM, birthDate: "вчера" });

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
