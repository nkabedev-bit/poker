import { describe, expect, it, vi } from "vitest";
import { loadPlayerAvatars } from "@/lib/players/avatars";

type Account = {
  avatar_thumb_url: string | null;
  avatar_url: string | null;
  display_name: string | null;
  telegram_id: number;
};

/** The accounts table, handing out the page it is asked for. */
function supabaseWith(accounts: Account[], error: unknown = null) {
  const query = {
    not: () => query,
    order: () => query,
    range: (from: number, to: number) =>
      Promise.resolve(error ? { data: null, error } : { data: accounts.slice(from, to + 1), error: null }),
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

describe("loadPlayerAvatars — a club past a thousand accounts", () => {
  it("finds the face of an account past the first thousand", async () => {
    const accounts: Account[] = Array.from({ length: 1500 }, (_, index) => ({
      avatar_thumb_url: `https://cdn/${index}-sm.webp`,
      avatar_url: `https://cdn/${index}.jpg`,
      display_name: `Игрок ${index}`,
      telegram_id: 100 + index,
    }));

    const avatars = await loadPlayerAvatars(supabaseWith(accounts));

    expect(avatars.find({ name: "Игрок 1499", telegramId: 1599 }).url).toBe("https://cdn/1499.jpg");
  });

  // The faces are a nicety: a failed read leaves letters, never an error on the page.
  it("leaves every player a letter when the accounts cannot be read", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const avatars = await loadPlayerAvatars(supabaseWith([], new Error("timeout")));

    expect(avatars.find({ name: "Karel", telegramId: 11 })).toEqual({ thumbUrl: null, url: null });
    errorLog.mockRestore();
  });
});
