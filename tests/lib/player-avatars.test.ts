import { describe, expect, it } from "vitest";
import { loadPlayerAvatars } from "@/lib/players/avatars";

type Account = {
  avatar_thumb_url: string | null;
  avatar_url: string | null;
  display_name: string | null;
  telegram_id: number;
};

function supabaseWith(accounts: Account[]) {
  const query = {
    not: () => Promise.resolve({ data: accounts, error: null }),
    select: () => query,
  };

  return { from: () => query } as never;
}

const ACCOUNTS: Account[] = [
  {
    avatar_thumb_url: "https://cdn/karel-sm.webp",
    avatar_url: "https://cdn/karel.jpg",
    display_name: "Karel",
    telegram_id: 11,
  },
  // Photographed before thumbnails existed: the lists fall back to the full picture.
  {
    avatar_thumb_url: null,
    avatar_url: "https://cdn/titan.jpg",
    display_name: "TitAn",
    telegram_id: 22,
  },
  { avatar_thumb_url: null, avatar_url: null, display_name: "Secret", telegram_id: 33 },
];

describe("loadPlayerAvatars", () => {
  it("finds the face by the id a game recorded, in both sizes", async () => {
    const avatars = await loadPlayerAvatars(supabaseWith(ACCOUNTS));

    expect(avatars.find({ name: "переименовался", telegramId: 11 })).toEqual({
      thumbUrl: "https://cdn/karel-sm.webp",
      url: "https://cdn/karel.jpg",
    });
  });

  it("finds the face by nickname when the game knows only a name", async () => {
    const avatars = await loadPlayerAvatars(supabaseWith(ACCOUNTS));

    // No thumbnail was ever made for this one, so the list shows the picture itself
    // rather than dropping back to a letter.
    expect(avatars.find({ name: "tit_an", telegramId: null })).toEqual({
      thumbUrl: "https://cdn/titan.jpg",
      url: "https://cdn/titan.jpg",
    });
  });

  it("gives nothing for a player nobody has an account for", async () => {
    const avatars = await loadPlayerAvatars(supabaseWith(ACCOUNTS));

    expect(avatars.find({ name: "Саймон", telegramId: null })).toEqual({
      thumbUrl: null,
      url: null,
    });
    expect(avatars.find({ name: "Secret", telegramId: 33 })).toEqual({
      thumbUrl: null,
      url: null,
    });
  });
});
