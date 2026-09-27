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

type AccountRow = Record<string, unknown> & { id: string };

const CHURA: AccountRow = {
  display_name: "Chura",
  id: "account-chura",
  nickname_key: "chura",
  profile_submitted_at: "2026-06-01T00:00:00.000Z",
};

/**
 * The accounts table, as far as the questionnaire asks it anything: who holds a
 * nickname, and what gets written back. Filters narrow the rows the way the database
 * would, so a lookup that forgets one finds the wrong player here too.
 */
function supabaseSpy({
  accounts = [] as AccountRow[],
  linkError = null as { message: string } | null,
} = {}) {
  const writes: Record<string, unknown>[] = [];

  const from = vi.fn(() => {
    let rows = accounts;
    const chain = {
      eq: vi.fn((column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return chain;
      }),
      limit: vi.fn(async (count: number) => ({ data: rows.slice(0, count), error: null })),
      neq: vi.fn((column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] !== value);
        return chain;
      }),
      not: vi.fn((column: string) => {
        rows = rows.filter((row) => row[column] !== null && row[column] !== undefined);
        return chain;
      }),
      select: vi.fn(() => chain),
      update: vi.fn((values: Record<string, unknown>) => {
        writes.push(values);
        const error = "referred_by_user_id" in values ? linkError : null;
        return { eq: vi.fn(async () => ({ error })) };
      }),
    };

    return chain;
  });

  return { supabase: { from }, writes };
}

// Without the question at all — the way a mini-app build cached before it still sends it.
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

const NEWCOMER = { id: "account-me", profile_submitted_at: null, telegram_id: 555, username: null };

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
    const { supabase, writes } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit();

    expect(response.status).toBe(200);
    expect(writes).toEqual([
      expect.objectContaining({
        display_name: "1$",
        pending_profile_answers: expect.objectContaining({ invitedBy: "" }),
      }),
    ]);
  });

  // A member who already has an account and answers "нет, я впервые" out of habit would
  // otherwise end up with two profiles under one name.
  it("refuses a nickname another account already holds", async () => {
    const { supabase, writes } = supabaseSpy({
      accounts: [{ display_name: "1$", id: "account-other", nickname_key: "1" }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: { ...NEWCOMER, telegram_id: null },
    });

    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "nickname_taken" });
    expect(writes).toEqual([]);
  });

  it("refuses a second questionnaire from a player who filled one in", async () => {
    const { supabase, writes } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({
      supabase,
      user: { ...NEWCOMER, profile_submitted_at: "2026-08-01T00:00:00.000Z" },
    });

    const response = await submit();

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "already_submitted" });
    expect(writes).toEqual([]);
  });

  it("refuses a birth date that is not one", async () => {
    const { supabase, writes } = supabaseSpy();
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, birthDate: "вчера" });

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });
});

describe("naming who brought the player in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.appendClientBotProfileRow.mockResolvedValue({ sheetName: "анкеты" });
  });

  it("links the newcomer to the member they named, spelled the club's way", async () => {
    const { supabase, writes } = supabaseSpy({ accounts: [CHURA] });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "  CHURA " });

    expect(response.status).toBe(200);
    expect(writes).toEqual([
      expect.objectContaining({
        pending_profile_answers: expect.objectContaining({ invitedBy: "Chura" }),
      }),
      { referred_by_user_id: "account-chura" },
    ]);
    expect(mocks.appendClientBotProfileRow).toHaveBeenCalledWith(
      expect.objectContaining({ answers: expect.objectContaining({ invitedBy: "Chura" }) }),
    );
  });

  // The link is what the referral achievements will count, so a guess is sent back
  // rather than kept pointing at nobody.
  it("sends back a nickname nobody in the club holds", async () => {
    const { supabase, writes } = supabaseSpy({ accounts: [CHURA] });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "Саша" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "referrer_not_found",
      message: expect.stringContaining("«Саша»"),
    });
    expect(writes).toEqual([]);
  });

  // Somebody who opened the bot but never filled in the questionnaire is not a member
  // yet — the same line the member search draws.
  it("does not count an account without a questionnaire as a member", async () => {
    const { supabase, writes } = supabaseSpy({
      accounts: [{ ...CHURA, profile_submitted_at: null }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "Chura" });

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("does not let a player name themselves", async () => {
    const { supabase, writes } = supabaseSpy({
      accounts: [{ ...CHURA, id: NEWCOMER.id }],
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "Chura" });

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("sends back a name with nothing to look up by", async () => {
    const { supabase, writes } = supabaseSpy({ accounts: [CHURA] });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "—" });

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("links nobody when the field is left empty", async () => {
    const { supabase, writes } = supabaseSpy({ accounts: [CHURA] });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "   " });

    expect(response.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toHaveProperty("referred_by_user_id");
  });

  // The column arrives with a migration applied by hand, possibly after the code: until
  // then the link cannot be written, and the newcomer must still get in.
  it("still registers the player when the link cannot be written", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase, writes } = supabaseSpy({
      accounts: [CHURA],
      linkError: { message: 'column "referred_by_user_id" does not exist' },
    });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "Chura" });

    expect(response.status).toBe(200);
    expect(writes[0]).toMatchObject({
      pending_profile_answers: expect.objectContaining({ invitedBy: "Chura" }),
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Non-critical referral link error:",
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  // The questionnaire answers go back to nobody but the desk.
  it("does not tell the newcomer anything about the member they named", async () => {
    const { supabase } = supabaseSpy({ accounts: [CHURA] });
    mocks.requireClientTmaAuth.mockResolvedValue({ supabase, user: NEWCOMER });

    const response = await submit({ ...FORM, invitedBy: "Chura" });

    expect(await response.json()).toEqual({ nickname: "1$", profileSubmitted: true });
  });
});
