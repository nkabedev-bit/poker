import crypto from "crypto";

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

export function validateInitData(initData: string): { ok: boolean; userId?: number } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");

    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(process.env.TELEGRAM_BOT_TOKEN || "")
      .digest();

    const expectedHash = crypto
      .createHmac("sha256", secretKey)
      .update(checkString)
      .digest("hex");

    if (hash !== expectedHash) {
      return { ok: false };
    }

    const authDate = Number(params.get("auth_date"));
    // TMA can stay open for a full tournament day while the phone is locked.
    if (Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) {
      return { ok: false };
    }

    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : {};

    return { ok: true, userId: user.id };
  } catch {
    return { ok: false };
  }
}
