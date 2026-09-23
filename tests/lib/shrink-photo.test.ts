/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitWithin, PHOTO_MAX_SIDE, shrinkPhoto } from "@/lib/media/shrink-photo";

describe("fitWithin", () => {
  it("brings a camera photo down to the longest side the server needs", () => {
    expect(fitWithin(4000, 3000, PHOTO_MAX_SIDE)).toEqual({ height: 960, width: 1280 });
    expect(fitWithin(3000, 4000, PHOTO_MAX_SIDE)).toEqual({ height: 1280, width: 960 });
    expect(fitWithin(5000, 5000, PHOTO_MAX_SIDE)).toEqual({ height: 1280, width: 1280 });
  });

  // Blowing a small picture up would only make it heavier.
  it("leaves a picture that is already small at its own size", () => {
    expect(fitWithin(800, 600, PHOTO_MAX_SIDE)).toEqual({ height: 600, width: 800 });
  });

  it("survives a picture that reports no size", () => {
    expect(fitWithin(0, 0, PHOTO_MAX_SIDE)).toEqual({ height: 1, width: 1 });
  });
});

describe("shrinkPhoto", () => {
  /** How the stand-in picture behaves once the browser is asked to open it. */
  let opens: boolean;
  const drawImage = vi.fn();

  beforeEach(() => {
    opens = true;
    drawImage.mockClear();

    class FakeImage {
      naturalHeight = 3000;
      naturalWidth = 4000;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      set src(_url: string) {
        queueMicrotask(() => (opens ? this.onload?.() : this.onerror?.()));
      }
    }

    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return `data:image/jpeg;base64,${this.width}x${this.height}`;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws a camera photo down to size and sends it as a JPEG", async () => {
    const dataUrl = await shrinkPhoto(new Blob(["photo"], { type: "image/jpeg" }));

    expect(dataUrl).toBe("data:image/jpeg;base64,1280x960");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 960);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  // A poster is kept larger than a profile photo, and a shade sharper.
  it("draws a poster to the size and quality it asks for", async () => {
    const dataUrl = await shrinkPhoto(new Blob(["poster"], { type: "image/png" }), {
      maxSide: 1200,
      quality: 0.9,
    });

    expect(dataUrl).toBe("data:image/jpeg;base64,1200x900");
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.9);
  });

  // The caller then sends the file as it is, and the server says what is wrong with it.
  it("hands back nothing when the browser cannot open the photo", async () => {
    opens = false;

    expect(await shrinkPhoto(new Blob(["not a photo"]))).toBeNull();
    expect(drawImage).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });
});
