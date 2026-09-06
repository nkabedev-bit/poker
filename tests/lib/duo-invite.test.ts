import { describe, expect, it, vi } from "vitest";
import { claimDuoInvite, createDuoInviteToken } from "@/lib/events/duo";

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
