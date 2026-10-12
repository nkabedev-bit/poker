/**
 * The part of a photo a player keeps for their profile.
 *
 * The photo lies under a round frame `frame` pixels across. At zoom 1 its shorter side
 * just fills the frame; the player drags it (`x`, `y` — how far its centre sits from the
 * frame's centre, in screen pixels) and brings it closer. The photo always covers the
 * whole frame, so the circle never shows an empty corner.
 */

export type CropView = { x: number; y: number; zoom: number };

type Size = { height: number; width: number };

/** Closer than this a profile photo is a blur of pixels. */
export const MAX_CROP_ZOOM = 4;

/**
 * The longest side a picked photo is opened at for framing: a 48-megapixel camera photo
 * held whole would drag on a modest phone, and a face cut from 2048 pixels is still far
 * sharper than the 320 the server keeps.
 */
export const CROP_SOURCE_MAX_SIDE = 2048;

/** The side of the square sent to the server, which keeps a 320-pixel copy of it. */
export const CROP_OUTPUT_SIDE = 640;

const CROP_OUTPUT_QUALITY = 0.9;

export const INITIAL_CROP_VIEW: CropView = { x: 0, y: 0, zoom: 1 };

/** Screen pixels per photo pixel at zoom 1: the shorter side spans the frame. */
export function getCoverScale(image: Size, frame: number) {
  return frame / Math.max(1, Math.min(image.width, image.height));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** The view brought back inside what the photo allows: zoom in range, no gap in the frame. */
export function clampCropView(view: CropView, image: Size, frame: number): CropView {
  const zoom = clampNumber(view.zoom, 1, MAX_CROP_ZOOM);
  const scale = getCoverScale(image, frame) * zoom;
  const slackX = Math.max(0, (image.width * scale - frame) / 2);
  const slackY = Math.max(0, (image.height * scale - frame) / 2);

  // `|| 0` turns the -0 a photo with no slack is clamped to back into a plain 0.
  return {
    x: clampNumber(view.x, -slackX, slackX) || 0,
    y: clampNumber(view.y, -slackY, slackY) || 0,
    zoom,
  };
}

/**
 * The view at a new zoom that keeps the point under the fingers (or the cursor) where it
 * is. `anchor` is that point, measured from the frame's centre in screen pixels.
 */
export function zoomCropView(
  view: CropView,
  nextZoom: number,
  anchor: { x: number; y: number },
  image: Size,
  frame: number,
): CropView {
  const zoom = clampNumber(nextZoom, 1, MAX_CROP_ZOOM);
  const ratio = zoom / view.zoom;

  return clampCropView(
    {
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
      zoom,
    },
    image,
    frame,
  );
}

/** The square of the photo, in its own pixels, that sits inside the frame. */
export function getCropRect(view: CropView, image: Size, frame: number) {
  const { x, y, zoom } = clampCropView(view, image, frame);
  const scale = getCoverScale(image, frame) * zoom;
  const side = Math.min(frame / scale, image.width, image.height);
  const centerX = image.width / 2 - x / scale;
  const centerY = image.height / 2 - y / scale;

  return {
    side,
    x: clampNumber(centerX - side / 2, 0, image.width - side),
    y: clampNumber(centerY - side / 2, 0, image.height - side),
  };
}

/** The framed square as a JPEG data URL, or null when the browser cannot draw it. */
export function renderCropToDataUrl(
  image: HTMLImageElement,
  view: CropView,
  frame: number,
  outputSide = CROP_OUTPUT_SIDE,
): string | null {
  const size = { height: image.naturalHeight, width: image.naturalWidth };
  const rect = getCropRect(view, size, frame);
  // A small photo is not blown up: it would only get heavier, not sharper.
  const side = Math.max(1, Math.round(Math.min(outputSide, rect.side)));

  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, side, side);
  return canvas.toDataURL("image/jpeg", CROP_OUTPUT_QUALITY);
}
