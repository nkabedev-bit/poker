import { describe, expect, it } from "vitest";
import { pickAvatarPhotoSize, shouldRefreshAvatar } from "@/lib/client-bot/avatar-policy";

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("shouldRefreshAvatar", () => {
  it("fetches a photo for a player who never had one synced", () => {
    expect(shouldRefreshAvatar(null, NOW)).toBe(true);
  });

  it("skips a player synced earlier this week", () => {
    expect(shouldRefreshAvatar("2026-08-30T12:00:00.000Z", NOW)).toBe(false);
  });

  it("refetches once a week has passed", () => {
    expect(shouldRefreshAvatar("2026-08-25T11:59:00.000Z", NOW)).toBe(true);
  });

  it("treats an unreadable timestamp as never synced", () => {
    expect(shouldRefreshAvatar("не дата", NOW)).toBe(true);
  });
});

describe("pickAvatarPhotoSize", () => {
  const small = { file_id: "s", height: 80, width: 80 };
  const medium = { file_id: "m", height: 320, width: 320 };
  const large = { file_id: "l", height: 640, width: 640 };

  it("takes the smallest size that still fills the circle", () => {
    expect(pickAvatarPhotoSize([small, medium, large])?.file_id).toBe("m");
  });

  it("falls back to the largest when every size is too small", () => {
    expect(pickAvatarPhotoSize([small])?.file_id).toBe("s");
  });

  it("returns nothing when the player has no photo", () => {
    expect(pickAvatarPhotoSize([])).toBeNull();
  });
});
