import { describe, expect, it, vi } from "vitest";
import { linkExistingAccount } from "@/lib/auth/link-account";

/** Answers the one query the linking makes: club accounts under a nickname key. */
function supabaseWith(matches: unknown[]) {
  const chain = {
    eq: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data: matches, error: null })),
    neq: vi.fn(() => chain),
    select: vi.fn(() => chain),
  };

  return { from: vi.fn(() => chain) } as never;
}

const ON_FILE = { id: "account-old", yandex_id: null };

function link(matches: unknown[], nickname: string) {
  return linkExistingAccount(supabaseWith(matches), {
    newAccountId: "account-new",
    nickname,
  });
}

describe("claiming an existing club profile", () => {
  it("hands over the profile the nickname belongs to", async () => {
    await expect(link([ON_FILE], "ADAM SMASHER")).resolves.toEqual({
      account: { id: "account-old" },
      error: null,
    });
  });

  // The club writes a nickname as it pleases, and the key is what matches it.
  it("finds the profile however the nickname was typed", async () => {
    await expect(link([ON_FILE], "adam_smasher")).resolves.toMatchObject({ error: null });
    await expect(link([ON_FILE], "  AdamSmasher ")).resolves.toMatchObject({ error: null });
  });

  it("refuses a nickname the club does not know", async () => {
    await expect(link([], "Nobody")).resolves.toMatchObject({ error: "not_found" });
  });

  it("refuses an empty nickname without asking the database", async () => {
    await expect(link([ON_FILE], "   ")).resolves.toMatchObject({ error: "not_found" });
  });

  // Two profiles under one nickname cannot be told apart by it, and handing over the
  // wrong history is worse than handing over none.
  it("refuses a nickname two profiles share", async () => {
    const twin = { ...ON_FILE, id: "account-twin" };

    await expect(link([ON_FILE, twin], "ADAM SMASHER")).resolves.toMatchObject({
      error: "not_found",
    });
  });

  it("refuses a profile already claimed by another Yandex account", async () => {
    await expect(
      link([{ ...ON_FILE, yandex_id: "yandex-1" }], "ADAM SMASHER"),
    ).resolves.toMatchObject({ error: "already_linked" });
  });
});
