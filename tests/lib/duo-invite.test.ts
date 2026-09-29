import { describe, expect, it, vi } from "vitest";
import { claimDuoInvite, createDuoInviteToken, findDuoInviterName } from "@/lib/events/duo";

/**
 * The two queries a claim makes: finding the invitation, and asking whether somebody is
 * already bringing this player. The update is the third, and its result is watched.
 */
function supabaseWith({
  invite,
  taken = false,
}: {
  invite: Record<string, unknown> | null;
  taken?: boolean;
}) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  let reads = 0;

  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.select = vi.fn(() => {
    reads += 1;
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => ({ data: invite, error: null }));
  chain.limit = vi.fn(async () => ({
    data: taken && reads > 1 ? [{ user_id: "somebody-else" }] : [],
    error: null,
  }));
  chain.update = update;

  return { supabase: { from: vi.fn(() => chain) } as never, update };
}

const INVITE = {
  duo_partner_user_id: null,
  event_id: "event-1",
  user_id: "account-host",
};

describe("the pass a 1+1 link carries", () => {
  it("is short enough to send and long enough not to guess", () => {
    const token = createDuoInviteToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(createDuoInviteToken()).not.toBe(token);
  });
});

describe("taking up an invitation", () => {
  it("makes the holder the second player", async () => {
    const { supabase, update } = supabaseWith({ invite: INVITE });

    await expect(
      claimDuoInvite(supabase, { token: "abc", userId: "account-friend" }),
    ).resolves.toEqual({ error: null, eventId: "event-1" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ duo_invite_token: null, duo_partner_user_id: "account-friend" }),
    );
  });

  // Spent on use: the same link must not seat two people.
  it("refuses a link nobody holds any more", async () => {
    const { supabase, update } = supabaseWith({ invite: null });

    await expect(
      claimDuoInvite(supabase, { token: "spent", userId: "account-friend" }),
    ).resolves.toMatchObject({ error: "gone" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a ticket whose partner is already settled", async () => {
    const { supabase } = supabaseWith({
      invite: { ...INVITE, duo_partner_user_id: "account-someone" },
    });

    await expect(
      claimDuoInvite(supabase, { token: "abc", userId: "account-friend" }),
    ).resolves.toMatchObject({ error: "gone" });
  });

  it("lets nobody bring themselves", async () => {
    const { supabase, update } = supabaseWith({ invite: INVITE });

    await expect(
      claimDuoInvite(supabase, { token: "abc", userId: "account-host" }),
    ).resolves.toMatchObject({ error: "self" });
    expect(update).not.toHaveBeenCalled();
  });

  // A member is the +1 of one ticket an evening, and the database says so too.
  it("refuses somebody another buyer is already bringing", async () => {
    const { supabase, update } = supabaseWith({ invite: INVITE, taken: true });

    await expect(
      claimDuoInvite(supabase, { token: "abc", userId: "account-friend" }),
    ).resolves.toMatchObject({ error: "taken" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses an empty token without asking the database", async () => {
    const { supabase } = supabaseWith({ invite: INVITE });

    await expect(
      claimDuoInvite(supabase, { token: "   ", userId: "account-friend" }),
    ).resolves.toMatchObject({ error: "gone" });
  });
});

describe("who asked a newcomer along", () => {
  /** The buyers' sign-ups naming this player as their +1, with every filter recorded. */
  function supabaseReading(rows: unknown[]) {
    const filters: unknown[][] = [];
    const chain: Record<string, unknown> = {
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    for (const link of ["eq", "neq", "order", "limit"]) {
      chain[link] = vi.fn((...args: unknown[]) => {
        filters.push([link, ...args]);
        return chain;
      });
    }
    chain.select = vi.fn(() => chain);

    return { filters, supabase: { from: vi.fn(() => chain) } as never };
  }

  it("names the buyer of the pair the newcomer was asked into", async () => {
    const { filters, supabase } = supabaseReading([
      { client_bot_users: { display_name: " TitAn " } },
    ]);

    await expect(findDuoInviterName(supabase, "account-friend")).resolves.toBe("TitAn");
    expect(filters).toEqual(
      expect.arrayContaining([
        ["eq", "ticket_type", "duo"],
        ["eq", "duo_partner_user_id", "account-friend"],
        ["neq", "status", "cancelled"],
      ]),
    );
  });

  it("names nobody when no member has asked", async () => {
    const { supabase } = supabaseReading([]);

    await expect(findDuoInviterName(supabase, "account-friend")).resolves.toBeNull();
  });
});
