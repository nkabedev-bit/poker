import { describe, expect, it, vi } from "vitest";
import { loadPublicState } from "@/lib/public-state";
import type { FoundPlate } from "@/lib/players/plate-store";

const mocks = vi.hoisted(() => ({ adminClient: null as unknown }));

vi.mock("@/lib/env", () => ({ hasPublicEnv: () => true }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => mocks.adminClient }));
vi.mock("@/lib/players/games-played", () => ({
  countGamesByNickname: async () =>
    new Map([
      ["chura", 25],
      ["newbie", 1],
      ["seller", 2],
      ["vera", 30],
    ]),
}));
vi.mock("@/lib/players/plate-store", () => {
  const plates: Record<string, FoundPlate> = {
    // A core player on a core shape.
    chura: { accountId: "a-chura", choice: { color: "teal", form: "chip_leader" } },
    // One game behind them: no tier, no shape.
    newbie: { accountId: "a-newbie", choice: { color: "ruby", form: "button" } },
    // The APC plate goes with the account, whatever the count.
    seller: { accountId: "ca9b21dc-aacc-42cf-b7dd-d2e455f31120", choice: { color: null, form: "apc" } },
    // A legend's shape kept by a core player: the board shows the tier's plate meanwhile.
    vera: { accountId: "a-vera", choice: { color: "ruby", form: "gatsby" } },
  };

  return {
    loadPlayerPlates: async () => ({
      find: ({ name }: { name?: string | null }) => plates[String(name).toLowerCase()] ?? null,
    }),
  };
});

const PLAYERS = ["Chura", "Newbie", "Seller", "Vera"].map((name, index) => ({
  bountyCount: 0,
  id: `p${index}`,
  name,
  rebuys: 0,
  status: "active",
  table: 1,
}));

function adminClient() {
  const query = (table: string) => {
    const chain = {
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () =>
        table === "tournaments"
          ? { data: null, error: null }
          : { data: { data: { players: PLAYERS } }, error: null },
      ),
      select: vi.fn(() => chain),
    };
    return chain;
  };

  return {
    from: vi.fn((table: string) => query(table)),
    rpc: vi.fn(async () => ({
      data: {
        blindLevels: [],
        timerState: {
          current_level_index: 0,
          finished_at: null,
          level_started_at: null,
          paused_remaining_seconds: null,
          registration_closes_at: null,
          status: "running",
        },
        tournament: {
          id: "t1",
          logo_url: null,
          name: "Турнир",
          public_token: "token-1",
          registration_minutes: 0,
          registration_status: "open",
          starting_stack: 20000,
        },
      },
      error: null,
    })),
  };
}

describe("loadPublicState — the plates players picked", () => {
  it("hands the board a plate only where the player's tier or name opens it", async () => {
    mocks.adminClient = adminClient();

    const state = await loadPublicState("token-1");
    const plates = Object.fromEntries(
      (state?.extras.players ?? []).map((player) => [player.name, player.plate ?? null]),
    );

    expect(plates).toEqual({
      Chura: { color: "teal", form: "chip_leader" },
      Newbie: null,
      Seller: { color: null, form: "apc" },
      Vera: null,
    });
  });
});
