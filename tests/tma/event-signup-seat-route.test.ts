import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

const mocks = vi.hoisted(() => ({
  adjustFreeEntries: vi.fn(),
  appendTournamentPlayerWithRegistrationNumber: vi.fn(),
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  syncVipSheet: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("@/lib/free-entries/adjust", () => ({ adjustFreeEntries: mocks.adjustFreeEntries }));
vi.mock("@/lib/google-sheets", () => ({ syncVipSheet: mocks.syncVipSheet }));
vi.mock("@/lib/tournament-extras", () => ({ loadTournamentExtras: mocks.loadTournamentExtras }));
vi.mock("@/lib/tournament-player-registration", () => ({
  appendTournamentPlayerWithRegistrationNumber: mocks.appendTournamentPlayerWithRegistrationNumber,
  buildNumbersExhaustedMessage: () => "",
  buildRegistrationFullMessage: () => "",
  isRegistrationNumbersExhaustedError: () => false,
  isTournamentRegistrationCapacityError: () => false,
}));
vi.mock("next/server", () => ({
  after: () => {},
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

/** A player standing in line for tonight, the way the sign-ups table holds them. */
const QUEUED = {
  client_bot_users: { display_name: "Иван Очередь", free_entries: 0, vip_free_entries: 0 },
  event_id: "event-1",
  id: "wait-1",
  status: "waitlist",
  telegram_id: 777,
  ticket_type: "regular",
  use_pass: "none",
  user_id: "account-9",
};

/** The tables the route reads and writes, recording every write. */
function supabaseSpy(signup: Record<string, unknown>) {
  const writes: Array<{ id: unknown; table: string; values: Record<string, unknown> }> = [];
  const lookups: unknown[] = [];

  const update = (table: string) => (values: Record<string, unknown>) => ({
    eq: async (_column: string, id: unknown) => {
      writes.push({ id, table, values });
      return { error: null };
    },
  });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "tournaments") {
        return {
          select: () => ({
            limit: () => ({
              single: async () => ({
                data: { id: "tournament-1", public_token: "token", starting_stack: 20000 },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "event_signups") {
        return {
          select: () => ({
            eq: (_column: string, id: unknown) => ({
              maybeSingle: async () => {
                lookups.push(id);
                return { data: id === signup.id ? signup : null, error: null };
              },
            }),
          }),
          update: update(table),
        };
      }
      if (table === "client_bot_users") return { update: update(table) };

      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: vi.fn(),
  };

  return { lookups, supabase, writes };
}

async function seat(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/tma/event-signups/[id]/seat/route");
  return POST(
    new Request("http://localhost/api/tma/event-signups/wait-1/seat", {
      body: JSON.stringify(body),
      method: "POST",
    }),
    { params: Promise.resolve({ id: "wait-1" }) },
  );
}

describe("seating a player from the waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({ players: [], settings: { maxPlayersPerTable: 9, tablesCount: 3 } }),
    );
    mocks.appendTournamentPlayerWithRegistrationNumber.mockImplementation(
      async ({ player }: { player: Record<string, unknown> }) => ({ ...player, registrationNumber: 22 }),
    );
  });

  // People come late, and the desk cannot tell who of those signed up is still coming.
  it("seats them on the ticket picked, in nobody's stead", async () => {
    const { supabase, writes } = supabaseSpy(QUEUED);
    mocks.requireTmaAuth.mockResolvedValue({ supabase });

    const response = await seat({ seat: 3, table: 1, ticketType: "vip" });

    expect(response.status).toBe(200);
    expect(mocks.appendTournamentPlayerWithRegistrationNumber).toHaveBeenCalledWith(
      expect.objectContaining({
        player: expect.objectContaining({
          name: "Иван Очередь",
          seat: 3,
          table: 1,
          ticketType: "vip",
        }),
      }),
    );
    expect(writes).toContainEqual({
      id: "wait-1",
      table: "event_signups",
      values: { status: "seated", ticket_type: "vip" },
    });
    expect(writes.some((write) => write.values.status === "no_show")).toBe(false);
  });

  // A screen opened before the change may still send whose place it was; the seat
  // stands, and nobody who signed up loses theirs over it.
  it("marks nobody as a no-show, even when an older screen names somebody", async () => {
    const { lookups, supabase, writes } = supabaseSpy(QUEUED);
    mocks.requireTmaAuth.mockResolvedValue({ supabase });

    const response = await seat({
      replacesSignupId: "signup-1",
      seat: 3,
      table: 1,
      ticketType: "regular",
    });

    expect(response.status).toBe(200);
    expect(lookups).toEqual(["wait-1"]);
    expect(writes.some((write) => write.values.status === "no_show")).toBe(false);
  });
});
