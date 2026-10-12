import { describe, expect, it } from "vitest";
import {
  clampCropView,
  getCoverScale,
  getCropRect,
  INITIAL_CROP_VIEW,
  MAX_CROP_ZOOM,
  zoomCropView,
} from "@/lib/media/photo-crop";

const FRAME = 300;
const LANDSCAPE = { height: 3000, width: 4000 };
const PORTRAIT = { height: 4000, width: 3000 };
const SQUARE = { height: 1000, width: 1000 };

describe("getCoverScale", () => {
  it("lets the shorter side span the frame", () => {
    expect(getCoverScale(LANDSCAPE, FRAME)).toBe(0.1);
    expect(getCoverScale(PORTRAIT, FRAME)).toBe(0.1);
    expect(getCoverScale(SQUARE, FRAME)).toBe(0.3);
  });
});

describe("clampCropView", () => {
  it("lets a wide photo slide sideways only as far as its edge", () => {
    // 4000 px at 0.1 is 400 on screen: 50 px of slack on each side, none up or down.
    expect(clampCropView({ x: 500, y: 500, zoom: 1 }, LANDSCAPE, FRAME)).toEqual({ x: 50, y: 0, zoom: 1 });
    expect(clampCropView({ x: -500, y: -500, zoom: 1 }, LANDSCAPE, FRAME)).toEqual({ x: -50, y: 0, zoom: 1 });
  });

  it("lets a tall photo slide up and down only", () => {
    expect(clampCropView({ x: 500, y: -500, zoom: 1 }, PORTRAIT, FRAME)).toEqual({ x: 0, y: -50, zoom: 1 });
  });

  it("keeps the zoom between the whole photo and the closest look", () => {
    expect(clampCropView({ x: 0, y: 0, zoom: 0.2 }, SQUARE, FRAME).zoom).toBe(1);
    expect(clampCropView({ x: 0, y: 0, zoom: 99 }, SQUARE, FRAME).zoom).toBe(MAX_CROP_ZOOM);
  });

  it("gives more room to move once the photo is closer", () => {
    // A square photo at zoom 2 is 600 on screen: 150 px of slack every way.
    expect(clampCropView({ x: 1000, y: -1000, zoom: 2 }, SQUARE, FRAME)).toEqual({ x: 150, y: -150, zoom: 2 });
  });
});

describe("zoomCropView", () => {
  it("zooms about the frame's centre without moving the middle", () => {
    expect(zoomCropView({ x: 20, y: 0, zoom: 1 }, 2, { x: 0, y: 0 }, LANDSCAPE, FRAME)).toEqual({
      x: 40,
      y: 0,
      zoom: 2,
    });
  });

  it("keeps the point under the fingers in place", () => {
    const view = zoomCropView(INITIAL_CROP_VIEW, 2, { x: 100, y: 100 }, SQUARE, FRAME);

    // The photo moves away from the anchor so the anchor stays put: 100 - (100 - 0) * 2.
    expect(view).toEqual({ x: -100, y: -100, zoom: 2 });
  });

  it("pulls the photo back over the frame when zooming out leaves a gap", () => {
    expect(zoomCropView({ x: 150, y: 150, zoom: 2 }, 1, { x: 0, y: 0 }, SQUARE, FRAME)).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
  });
});

describe("getCropRect", () => {
  it("takes the middle square of a wide photo at first", () => {
    expect(getCropRect(INITIAL_CROP_VIEW, LANDSCAPE, FRAME)).toEqual({ side: 3000, x: 500, y: 0 });
  });

  it("follows the photo dragged to the right onto its left edge", () => {
    expect(getCropRect({ x: 50, y: 0, zoom: 1 }, LANDSCAPE, FRAME)).toEqual({ side: 3000, x: 0, y: 0 });
  });

  it("takes a smaller square around the face once zoomed in", () => {
    // Zoom 2 on a 1000 px square: the frame holds 500 px; dragged 150 left and up on
    // screen is 250 px of photo toward its bottom-right corner.
    expect(getCropRect({ x: -150, y: -150, zoom: 2 }, SQUARE, FRAME)).toEqual({ side: 500, x: 500, y: 500 });
  });

  it("never reaches outside the photo, whatever the view says", () => {
    const rect = getCropRect({ x: -9999, y: 9999, zoom: 3 }, PORTRAIT, FRAME);

    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.side).toBeLessThanOrEqual(PORTRAIT.width + 1e-9);
    expect(rect.y + rect.side).toBeLessThanOrEqual(PORTRAIT.height + 1e-9);
  });
});
