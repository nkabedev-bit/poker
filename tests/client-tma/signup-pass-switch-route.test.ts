import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireClientTmaAuth: vi.fn(),
  switchSignupPass: vi.fn(),
}));

vi.mock("@/lib/client-tma/require-auth", () => ({
  requireClientTmaAuth: mocks.requireClientTmaAuth,
}));

// What may be switched and when is the switch's own test; here it is the route's answer.
vi.mock("@/lib/free-entries/switch-pass", () => ({
  switchSignupPass: mocks.switchSignupPass,
}));

vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => task(),
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

import { PATCH } from "@/app/api/client-tma/events/[id]/signup/route";

const USER = { free_entries: 1, id: "user-1", telegram_id: 555 };

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/client-tma/events/event-1/signup", {
      body: JSON.stringify(body),
      method: "PATCH",
    }),
    { params: Promise.resolve({ id: "event-1" }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClientTmaAuth.mockResolvedValue({ supabase: {}, user: USER });
});

describe("PATCH /api/client-tma/events/[id]/signup", () => {
  it("switches the ticket held to the pass", async () => {
    mocks.switchSignupPass.mockResolvedValue({ event: {}, ok: true, usePass: "regular" });

    const response = await patch({ usePass: "regular" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ usePass: "regular" });
    expect(mocks.switchSignupPass).toHaveBeenCalledWith({}, {
      account: USER,
      eventId: "event-1",
      usePass: "regular",
    });
  });

  it("passes a refusal on with its wording", async () => {
    mocks.switchSignupPass.mockResolvedValue({
      error: "no_pass",
      message: "Свободных проходок не осталось.",
      ok: false,
    });

    const response = await patch({ usePass: "regular" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "no_pass",
      message: "Свободных проходок не осталось.",
    });
  });

  it("refuses a choice it does not know", async () => {
    const response = await patch({ usePass: "vip" });

    expect(response.status).toBe(400);
    expect(mocks.switchSignupPass).not.toHaveBeenCalled();
  });
});
