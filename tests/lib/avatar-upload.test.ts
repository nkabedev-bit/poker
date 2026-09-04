import { describe, expect, it } from "vitest";
import { parseAvatarDataUrl } from "@/lib/players/avatar-data-url";

// A 1×1 PNG, the smallest thing a file picker can hand back.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("parseAvatarDataUrl", () => {
  it("reads the picture out of a data URL", () => {
    const bytes = parseAvatarDataUrl(PNG);

    expect(bytes).toBeInstanceOf(Buffer);
    expect(bytes!.byteLength).toBeGreaterThan(0);
  });

  it("takes a JPEG from the camera as readily", () => {
    expect(parseAvatarDataUrl(PNG.replace("image/png", "image/jpeg"))).not.toBeNull();
  });

  it("refuses anything that is not a picture", () => {
    expect(parseAvatarDataUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(parseAvatarDataUrl("https://example.test/photo.png")).toBeNull();
    expect(parseAvatarDataUrl("")).toBeNull();
  });

  it("refuses a data URL with nothing behind the comma", () => {
    expect(parseAvatarDataUrl("data:image/png;base64,")).toBeNull();
  });
});
