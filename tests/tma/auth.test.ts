import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateInitData } from "@/lib/tma/auth";

const botToken = "123456:test-token";

function signedInitData(authDate: number) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: 42, first_name: "Admin" }),
  });

  const checkString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
  params.set("hash", hash);

  return params.toString();
}

describe("validateInitData", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = botToken;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-14T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  it("keeps a still-open admin TMA session valid after several idle hours", () => {
    const authDate = Math.floor(new Date("2026-05-14T07:00:00.000Z").getTime() / 1000);

    expect(validateInitData(signedInitData(authDate))).toEqual({ ok: true, userId: 42 });
  });

  it("rejects stale init data from a previous day", () => {
    const authDate = Math.floor(new Date("2026-05-13T11:59:59.000Z").getTime() / 1000);

    expect(validateInitData(signedInitData(authDate))).toEqual({ ok: false });
  });
});
