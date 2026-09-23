/**
 * A phone photo made small enough to send.
 *
 * A photo straight off a phone camera runs to several megabytes, and a request over
 * 4.5 MB never reaches the club's server at all: Vercel turns it away with a 413 before
 * any of our code runs, and all anybody is told is that the picture was not saved. The
 * server shrinks every picture it keeps anyway — a profile photo to 320 pixels, a poster
 * to 1200 — so the phone scales it down first and sends a few hundred kilobytes instead.
 */

/** The longest side of a profile photo sent; the server cuts its 320-pixel square out of it. */
export const PHOTO_MAX_SIDE = 1280;

const PHOTO_QUALITY = 0.85;

/** The size a picture is drawn at: never larger than it was, never longer than `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The browser could not open the photo"));
    image.src = url;
  });
}

/**
 * The picture as a JPEG data URL no longer than `maxSide` on its longest side, or null
 * when the browser cannot open it — the caller then sends the file as it is, and the
 * server says what is wrong with it.
 *
 * Drawn through an image element, which the browser turns the right way up from the
 * photo's own orientation tag: the canvas keeps no tags, so the picture has to be
 * upright by the time it is drawn.
 */
export async function shrinkPhoto(
  file: Blob,
  { maxSide = PHOTO_MAX_SIDE, quality = PHOTO_QUALITY }: { maxSide?: number; quality?: number } = {},
): Promise<string | null> {
  let url: string | null = null;

  try {
    url = URL.createObjectURL(file);
    const image = await loadImage(url);
    const { height, width } = fitWithin(image.naturalWidth, image.naturalHeight, maxSide);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
