export type LogoUploadPayload = {
  bytes: Buffer;
  name: string;
  type: string;
};

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
