import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";

const STORAGE = "https://project.supabase.co/storage/v1/object/public";

describe("toOwnOriginMediaUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves a stored photo from the club's own domain, version and all", () => {
    expect(toOwnOriginMediaUrl(`${STORAGE}/player-avatars/thumbs/42.webp?v=1757430000000`)).toBe(
      "/media/player-avatars/thumbs/42.webp?v=1757430000000",
    );
  });

  it("serves posters and the break sound the same way", () => {
    expect(toOwnOriginMediaUrl(`${STORAGE}/tournament-logos/events/poster.png`)).toBe(
      "/media/tournament-logos/events/poster.png",
    );
    expect(toOwnOriginMediaUrl(`${STORAGE}/tournament-sounds/t1/alert.mp3`)).toBe(
      "/media/tournament-sounds/t1/alert.mp3",
    );
  });

  it("copes with a project URL written with a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co/");

    expect(toOwnOriginMediaUrl(`${STORAGE}/player-avatars/42.jpg`)).toBe(
      "/media/player-avatars/42.jpg",
    );
  });

  // A Telegram photo, a preview still in the browser, a picture shipped with the app —
  // none of these are ours to proxy.
  it("leaves anything that is not one of the club's stored files alone", () => {
    expect(toOwnOriginMediaUrl("https://t.me/i/userpic/320/abc.jpg")).toBe(
      "https://t.me/i/userpic/320/abc.jpg",
    );
    expect(toOwnOriginMediaUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(toOwnOriginMediaUrl("/demo-logo.png")).toBe("/demo-logo.png");
    expect(toOwnOriginMediaUrl("https://other.supabase.co/storage/v1/object/public/player-avatars/1.jpg")).toBe(
      "https://other.supabase.co/storage/v1/object/public/player-avatars/1.jpg",
    );
  });

  it("leaves a bucket the club does not serve on Supabase", () => {
    expect(toOwnOriginMediaUrl(`${STORAGE}/private-exports/list.csv`)).toBe(
      `${STORAGE}/private-exports/list.csv`,
    );
  });

  // The /media route only takes plain names; a URL it would refuse keeps working as before.
  it("leaves a file with an unusual name on Supabase", () => {
    expect(toOwnOriginMediaUrl(`${STORAGE}/tournament-logos/logo%20final.png`)).toBe(
      `${STORAGE}/tournament-logos/logo%20final.png`,
    );
  });

  it("has nothing to show for a player without a photo", () => {
    expect(toOwnOriginMediaUrl(null)).toBeUndefined();
    expect(toOwnOriginMediaUrl(undefined)).toBeUndefined();
    expect(toOwnOriginMediaUrl("")).toBeUndefined();
  });

  it("keeps the stored URL when the app does not know its Supabase project", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(toOwnOriginMediaUrl(`${STORAGE}/player-avatars/42.jpg`)).toBe(
      `${STORAGE}/player-avatars/42.jpg`,
    );
  });
});
