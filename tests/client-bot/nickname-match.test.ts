import { describe, expect, it, vi } from "vitest";
import { findClientBotUserByNickname, normalizeNickname } from "@/lib/client-bot/nickname-match";

type Row = { display_name: string | null; telegram_id: number; username: string | null };

function supabaseReturning(rows: Row[]) {
  const ilike = vi.fn(() => ({ limit: vi.fn(async () => ({ data: rows, error: null })) }));

  return {
    client: { from: vi.fn(() => ({ select: vi.fn(() => ({ ilike })) })) },
    ilike,
  };
}

const ACE: Row = { display_name: "Ace High", telegram_id: 42, username: "ace" };

describe("normalizeNickname", () => {
  it("ignores case and stray spacing", () => {
    expect(normalizeNickname("  Ace   High ")).toBe("ace high");
    expect(normalizeNickname("СТАРЫЙ УЗБЕК")).toBe("старый узбек");
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

  it("drops rows the database matched loosely but that are not the same nickname", async () => {
    const { client } = supabaseReturning([{ ...ACE, display_name: "Ace Highest" }]);

    expect((await findClientBotUserByNickname(client as never, "Ace High")).user).toBeNull();
  });

  it("escapes wildcards so a nickname with % or _ cannot match everyone", async () => {
    const { client, ilike } = supabaseReturning([]);

    await findClientBotUserByNickname(client as never, "100%_ace");

    expect(ilike).toHaveBeenCalledWith("display_name", "100\\%\\_ace");
  });

  it("does not query at all for an empty nickname", async () => {
    const { client, ilike } = supabaseReturning([ACE]);

    expect((await findClientBotUserByNickname(client as never, "   ")).user).toBeNull();
    expect(ilike).not.toHaveBeenCalled();
  });
});
