import { describe, expect, it } from "vitest";
import {
  buildWebPasswordSavedReply,
  parseWebPasswordCommand,
  WEB_PASSWORD_COMMAND_HELP,
} from "@/lib/admin-bot/web-password-command";

describe("parseWebPasswordCommand", () => {
  it("reads the role and keeps the whole password, spaces included", () => {
    expect(parseWebPasswordCommand("/webpass флор два слова 2026")).toEqual({
      password: "два слова 2026",
      role: "floor",
    });
  });

  it("answers a bare command with what it does and takes", () => {
    expect(parseWebPasswordCommand("/webpass")).toEqual({ error: WEB_PASSWORD_COMMAND_HELP });
    expect(parseWebPasswordCommand("/webpass админ password-1")).toEqual({ error: WEB_PASSWORD_COMMAND_HELP });
  });

  it("refuses a password under eight characters", () => {
    const outcome = parseWebPasswordCommand("/webpass дилер 1234567");

    expect(outcome).toEqual({ error: expect.stringContaining("не меньше 8 символов") });
  });
});

describe("the /webpass help", () => {
  it("says what each password opens and that old desks close", () => {
    expect(WEB_PASSWORD_COMMAND_HELP).toContain("/webpass <флор|дилер> <пароль>");
    expect(WEB_PASSWORD_COMMAND_HELP).toContain("пароль дилера — только «Зал» и «Вылеты»");
    expect(WEB_PASSWORD_COMMAND_HELP).toContain("выходят");
  });
});

describe("buildWebPasswordSavedReply", () => {
  it("names the role and where to sign in", () => {
    const reply = buildWebPasswordSavedReply("dealer", "https://pokerptz.ru/tma");

    expect(reply).toContain("«дилер»");
    expect(reply).toContain("https://pokerptz.ru/tma");
  });
});
