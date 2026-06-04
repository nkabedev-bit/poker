import crypto from "crypto";

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
    // Проверка, что подпись не старше 1 часа
    if (Date.now() / 1000 - authDate > 3600) {
      return { ok: false };
    }

    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : {};

    return { ok: true, userId: user.id };
  } catch {
    return { ok: false };
  }
}
