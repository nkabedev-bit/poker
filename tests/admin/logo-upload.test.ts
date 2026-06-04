import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { parseLogoDataUrl, prepareLogoImage } from "@/lib/admin/logo-upload";

describe("parseLogoDataUrl", () => {
  it("decodes PNG data URLs into upload payload", () => {
    const result = parseLogoDataUrl({
      dataUrl: "data:image/png;base64,aGVsbG8=",
      name: "club logo.png",
      type: "image/png",
    });

    expect(result).toEqual({
      bytes: Buffer.from("hello"),
      name: "club logo.png",
      type: "image/png",
    });
  });

  it("rejects non-image data URLs", () => {
    expect(
      parseLogoDataUrl({
        dataUrl: "data:text/plain;base64,aGVsbG8=",
        name: "logo.txt",
        type: "text/plain",
      }),
    ).toBeNull();
  });

  it("keeps large square logos sharp enough for the public screen", async () => {
    const source = await sharp({
      create: {
        width: 1254,
        height: 1254,
        channels: 4,
        background: { r: 200, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await prepareLogoImage(source);
    const metadata = await sharp(result).metadata();

    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(1200);
  });
});
