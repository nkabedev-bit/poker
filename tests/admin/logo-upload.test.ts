import { describe, expect, it } from "vitest";
import { parseLogoDataUrl } from "@/lib/admin/logo-upload";

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
});
