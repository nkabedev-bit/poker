import { describe, expect, it } from "vitest";
import { pickPlayerPhoto } from "@/lib/players/photo";

const STORED = "https://project.supabase.co/storage/v1/object/public/player-avatars/42.jpg?v=7";
const TELEGRAM = "https://t.me/i/userpic/320/abc.jpg";

describe("pickPlayerPhoto", () => {
  // t.me is filtered in Russia like telegram.org; the stored copy comes from the club.
  it("shows the club's stored copy over Telegram's own photo", () => {
    expect(pickPlayerPhoto({ avatarUrl: STORED, telegramPhotoUrl: TELEGRAM })).toBe(STORED);
  });

  it("falls back to Telegram's photo while the club has no copy", () => {
    expect(pickPlayerPhoto({ avatarUrl: null, telegramPhotoUrl: TELEGRAM })).toBe(TELEGRAM);
    expect(pickPlayerPhoto({ avatarUrl: "", telegramPhotoUrl: TELEGRAM })).toBe(TELEGRAM);
  });

  it("has nothing to show for a player without any photo", () => {
    expect(pickPlayerPhoto({ avatarUrl: null, telegramPhotoUrl: undefined })).toBeUndefined();
  });
});
