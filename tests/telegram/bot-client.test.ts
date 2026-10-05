import { afterEach, describe, expect, it, vi } from "vitest";
import { telegramApiRoot } from "@/lib/telegram/bot-client";

describe("telegramApiRoot", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is Telegram itself when nothing is configured", () => {
    vi.stubEnv("TELEGRAM_API_ROOT", "");
    expect(telegramApiRoot()).toBe("https://api.telegram.org");
  });

  it("is the configured relay, without a trailing slash", () => {
    vi.stubEnv("TELEGRAM_API_ROOT", " https://club.example/api/tg-relay/ ");
    expect(telegramApiRoot()).toBe("https://club.example/api/tg-relay");
  });
});
