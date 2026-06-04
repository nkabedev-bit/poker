export type LogoUploadPayload = {
  bytes: Buffer;
  name: string;
  type: string;
};

export const LOGO_MAX_DIMENSION = 1200;

type LogoDataUrlInput = {
  dataUrl: string;
  name: string;
  type: string;
};

export function cleanLogoFileName(name: string) {
  return name.replace(/[^\wа-яА-ЯёЁ .()-]/g, "").trim().slice(0, 80) || "logo.png";
}

export function parseLogoDataUrl({
  dataUrl,
  name,
  type,
}: LogoDataUrlInput): LogoUploadPayload | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    bytes: Buffer.from(match[2], "base64"),
    name: cleanLogoFileName(name),
    type: type || match[1],
  };
}

export async function prepareLogoImage(bytes: Buffer) {
  const sharp = (await import("sharp")).default;

  return sharp(bytes)
    .resize(LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
