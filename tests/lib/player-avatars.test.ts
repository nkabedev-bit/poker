import { describe, expect, it } from "vitest";
import { loadPlayerAvatars } from "@/lib/players/avatars";

type Account = { avatar_url: string | null; display_name: string | null; telegram_id: number };

function supabaseWith(accounts: Account[]) {
  const query = {
    not: () => Promise.resolve({ data: accounts, error: null }),
    select: () => query,
  };

  return { from: () => query } as never;
}

const ACCOUNTS: Account[] = [
  { avatar_url: "https://cdn/karel.jpg", display_name: "Karel", telegram_id: 11 },
  { avatar_url: "https://cdn/titan.jpg", display_name: "TitAn", telegram_id: 22 },
  { avatar_url: null, display_name: "Secret", telegram_id: 33 },
];

describe("loadPlayerAvatars", () => {
  it("finds the face by the id a game recorded", async () => {
    const avatars = await loadPlayerAvatars(supabaseWith(ACCOUNTS));

    expect(avatars.find({ name: "переименовался", telegramId: 11 })).toBe("https://cdn/karel.jpg");
  });

  it("finds the face by nickname when the game knows only a name", async () => {
    const avatars = await loadPlayerAvatars(supabaseWith(ACCOUNTS));

    expect(avatars.find({ name: "tit_an", telegramId: null })).toBe("https://cdn/titan.jpg");
  });

  it("gives null for a player nobody has an account for", async () => {
    const avatars = await loadPlayerAvatars(supabaseWith(ACCOUNTS));

    expect(avatars.find({ name: "Саймон", telegramId: null })).toBeNull();
    expect(avatars.find({ name: "Secret", telegramId: 33 })).toBeNull();
  });
});
