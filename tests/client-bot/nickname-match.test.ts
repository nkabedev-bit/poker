import { describe, expect, it, vi } from "vitest";
import { findClientBotUserByNickname, normalizeNickname } from "@/lib/client-bot/nickname-match";

type Row = { display_name: string | null; telegram_id: number; username: string | null };

function supabaseReturning(rows: Row[]) {
  const eq = vi.fn(() => ({ limit: vi.fn(async () => ({ data: rows, error: null })) }));

  return {
    client: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) },
    eq,
  };
}

const ACE: Row = { display_name: "Ace High", telegram_id: 42, username: "ace" };

describe("normalizeNickname", () => {
  it("reads one player behind every way the club types their nickname", () => {
    expect(normalizeNickname("  Ace   High ")).toBe("acehigh");
    expect(normalizeNickname("ace_high")).toBe("acehigh");
    expect(normalizeNickname("СТАРЫЙ УЗБЕК")).toBe("старыйузбек");
  });
});

describe("findClientBotUserByNickname", () => {
  it("matches a questionnaire regardless of how the admin typed the nickname", async () => {
    const { client } = supabaseReturning([ACE]);

    const result = await findClientBotUserByNickname(client as never, "  ace   HIGH ");

    expect(result.user).toEqual({ displayName: "Ace High", telegramId: 42, username: "ace" });
    expect(result.ambiguous).toBe(false);
  });

  it("returns nobody when the nickname is unknown", async () => {
    const { client } = supabaseReturning([]);

    expect((await findClientBotUserByNickname(client as never, "Прохожий")).user).toBeNull();
  });

  // Crediting the wrong player is worse than crediting nobody.
  it("refuses to guess when several players share the nickname", async () => {
    const { client } = supabaseReturning([ACE, { ...ACE, telegram_id: 43 }]);

    const result = await findClientBotUserByNickname(client as never, "Ace High");

    expect(result).toEqual({ ambiguous: true, user: null });
  });

  it("asks the database for the key, not the spelling", async () => {
    const { client, eq } = supabaseReturning([]);

    await findClientBotUserByNickname(client as never, "100%_Ace");

    expect(eq).toHaveBeenCalledWith("nickname_key", "100ace");
  });

  it("does not query at all for a nickname with nothing to match on", async () => {
    const { client, eq } = supabaseReturning([ACE]);

    expect((await findClientBotUserByNickname(client as never, "  _- ")).user).toBeNull();
    expect(eq).not.toHaveBeenCalled();
  });
});
