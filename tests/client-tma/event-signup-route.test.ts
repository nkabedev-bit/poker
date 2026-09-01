import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventRow } from "@/lib/events/types";

const mocks = vi.hoisted(() => ({
  countActiveSignups: vi.fn(),
  getEvent: vi.fn(),
  requireClientTmaAuth: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

vi.mock("@/lib/events/store", () => ({
  countActiveSignups: mocks.countActiveSignups,
  getEvent: mocks.getEvent,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const FUTURE_EVENT = mapEventRow({
  buy_in: 1500,
  id: "event-1",
  is_published: true,
  late_entry_until: "2999-01-01T19:00:00.000Z",
  max_players: 2,
  starts_at: "2999-01-01T16:00:00.000Z",
  title: "ONE SHOT KNOCKOUT",
});

function upsertSpy() {
  const upsert = vi.fn(async () => ({ error: null }));
  return {
    supabase: { from: vi.fn(() => ({ upsert })) },
    upsert,
  };
}

function authWith({
  profileSubmitted = true,
  supabase = upsertSpy().supabase,
}: { profileSubmitted?: boolean; supabase?: unknown } = {}) {
  return {
    supabase,
    user: {
      display_name: "Ace High",
      profile_submitted_at: profileSubmitted ? "2026-08-01T00:00:00.000Z" : null,
      telegram_id: 555,
    },
  };
}

async function postSignup() {
  const { POST } = await import("@/app/api/client-tma/events/[id]/signup/route");
  return POST(new Request("http://localhost/api/client-tma/events/event-1/signup", { method: "POST" }), {
    params: Promise.resolve({ id: "event-1" }),
  });
}

describe("client sign-up route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.getEvent.mockResolvedValue(FUTURE_EVENT);
    mocks.countActiveSignups.mockResolvedValue(new Map([["event-1", 0]]));
  });

  it("records a sign-up for a player who filled in the questionnaire", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));

    const response = await postSignup();

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { event_id: "event-1", status: "signed_up", telegram_id: 555 },
      { onConflict: "event_id,telegram_id" },
    );
  });

  it("sends a player without a questionnaire to fill it in first", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ profileSubmitted: false, supabase }));

    const response = await postSignup();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("profile_required");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a sign-up once every seat is taken", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.countActiveSignups.mockResolvedValue(new Map([["event-1", 2]]));

    const response = await postSignup();

    expect(response.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses a sign-up when late entry has already closed", async () => {
    const { supabase, upsert } = upsertSpy();
    mocks.requireClientTmaAuth.mockResolvedValue(authWith({ supabase }));
    mocks.getEvent.mockResolvedValue(
      mapEventRow({
        id: "event-1",
        is_published: true,
        late_entry_until: "2020-01-01T19:00:00.000Z",
        starts_at: "2020-01-01T16:00:00.000Z",
        title: "Прошедший турнир",
      }),
    );

    const response = await postSignup();

    expect(response.status).toBe(409);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("hides an unpublished event from players", async () => {
    mocks.requireClientTmaAuth.mockResolvedValue(authWith());
    mocks.getEvent.mockResolvedValue({ ...FUTURE_EVENT, isPublished: false });

    const response = await postSignup();

    expect(response.status).toBe(404);
  });
});
