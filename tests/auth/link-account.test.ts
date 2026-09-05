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

const ON_FILE = {
  id: "account-old",
  pending_profile_answers: { birthDate: "07.03.1991" },
  yandex_id: null,
};

function link(matches: unknown[], nickname: string, birthDate: string) {
  return linkExistingAccount(supabaseWith(matches), {
    birthDate,
    newAccountId: "account-new",
    nickname,
  });
}

describe("claiming an existing club profile", () => {
  it("hands over the profile when the nickname and the birth date agree", async () => {
    await expect(link([ON_FILE], "ADAM SMASHER", "07.03.1991")).resolves.toEqual({
      account: { id: "account-old" },
      error: null,
    });
  });

  // The nickname is on the public rating for anyone to read, so it cannot be the proof.
  it("refuses the right nickname with the wrong birth date", async () => {
    await expect(link([ON_FILE], "ADAM SMASHER", "08.03.1991")).resolves.toMatchObject({
      error: "wrong_details",
    });
  });

  it("reads a date typed without leading zeros as the same day", async () => {
    await expect(link([ON_FILE], "ADAM SMASHER", "7.3.1991")).resolves.toMatchObject({
      error: null,
    });
  });

  it("refuses a nickname the club does not know", async () => {
    await expect(link([], "Nobody", "07.03.1991")).resolves.toMatchObject({
      error: "not_found",
    });
  });

  // Two profiles under one nickname cannot be told apart by it, and guessing would hand
  // somebody a history that is not theirs.
  it("refuses a nickname two profiles share", async () => {
    const twin = { ...ON_FILE, id: "account-twin" };

    await expect(link([ON_FILE, twin], "ADAM SMASHER", "07.03.1991")).resolves.toMatchObject({
      error: "not_found",
    });
  });

  it("refuses a profile already claimed by another Yandex account", async () => {
    await expect(
      link([{ ...ON_FILE, yandex_id: "yandex-1" }], "ADAM SMASHER", "07.03.1991"),
    ).resolves.toMatchObject({ error: "already_linked" });
  });

  // Profiles from before the questionnaire moved into the app have no date to check.
  it("sends a profile with no birth date on file to the admin", async () => {
    await expect(
      link([{ ...ON_FILE, pending_profile_answers: null }], "ADAM SMASHER", "07.03.1991"),
    ).resolves.toMatchObject({ error: "no_birth_date" });
  });

  it("refuses a date that is not one", async () => {
    await expect(link([ON_FILE], "ADAM SMASHER", "вчера")).resolves.toMatchObject({
      error: "wrong_details",
    });
  });
});
