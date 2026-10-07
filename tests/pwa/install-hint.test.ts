import { describe, expect, it } from "vitest";
import {
  chooseInstallHint,
  INSTALL_HINT_SNOOZE_MS,
  isHintSnoozed,
  isIosDevice,
} from "@/lib/pwa/install-hint";

const browser = { canPrompt: false, dismissed: false, inTelegram: false, isIos: false, standalone: false };

describe("chooseInstallHint", () => {
  it("says nothing inside the installed app", () => {
    expect(chooseInstallHint({ ...browser, standalone: true, canPrompt: true })).toBe("none");
  });

  it("says nothing once the player closed it", () => {
    expect(chooseInstallHint({ ...browser, dismissed: true, inTelegram: true })).toBe("none");
  });

  it("sends a mini-app player out to a browser, where the app installs", () => {
    expect(chooseInstallHint({ ...browser, inTelegram: true, canPrompt: true, isIos: true })).toBe("telegram");
  });

  it("uses the browser's own install dialog when it offers one", () => {
    expect(chooseInstallHint({ ...browser, canPrompt: true })).toBe("prompt");
  });

  it("shows an iPhone where «На экран „Домой“» is, since Safari never offers", () => {
    expect(chooseInstallHint({ ...browser, isIos: true })).toBe("ios");
  });

  it("points any other browser at its menu", () => {
    expect(chooseInstallHint(browser)).toBe("menu");
  });
});

describe("isIosDevice", () => {
  it("knows an iPhone and an iPad", () => {
    expect(isIosDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", 5)).toBe(true);
  });

  it("knows an iPad that asks for the desktop site, and not a real Mac", () => {
    const desktopSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
    expect(isIosDevice(desktopSafari, 5)).toBe(true);
    expect(isIosDevice(desktopSafari, 0)).toBe(false);
  });

  it("does not take Android for one", () => {
    expect(isIosDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe(false);
  });
});

describe("isHintSnoozed", () => {
  const now = 1_800_000_000_000;

  it("keeps a closed hint away for a month, then offers it again", () => {
    expect(isHintSnoozed(String(now - 1000), now)).toBe(true);
    expect(isHintSnoozed(String(now - INSTALL_HINT_SNOOZE_MS - 1), now)).toBe(false);
  });

  it("treats a missing or broken mark as never closed", () => {
    expect(isHintSnoozed(null, now)).toBe(false);
    expect(isHintSnoozed("soon", now)).toBe(false);
  });
});
