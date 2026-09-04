import { describe, expect, it } from "vitest";
import {
  buildClientBotProfileSheetRow,
  buildClientMiniAppReplyMarkup,
  CLIENT_BOT_PROFILE_SHEET_HEADERS,
  CLIENT_BOT_WELCOME_TEXT,
  isValidBirthDate,
  maskBirthDateInput,
  normalizeClientBotText,
} from "@/lib/client-bot/registration";

describe("client bot", () => {
  it("normalizes user-entered text", () => {
    expect(normalizeClientBotText("  Ace   High  ")).toBe("Ace High");
  });

  it("greets with the mini-app button as the only action", () => {
    process.env.CLIENT_TMA_URL = "https://example.com/client";

    expect(CLIENT_BOT_WELCOME_TEXT).toContain("Турниры, рейтинг и сервис клуба");
    expect(buildClientMiniAppReplyMarkup()).toEqual({
      inline_keyboard: [
        [{ text: "🎰 Открыть приложение", web_app: { url: "https://example.com/client" } }],
      ],
    });
  });

  it("drops the button rather than sending a broken one when no url is configured", () => {
    delete process.env.CLIENT_TMA_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

    expect(buildClientMiniAppReplyMarkup()).toEqual({ inline_keyboard: [] });
  });

  it("masks the birth date as digits are typed", () => {
    expect(maskBirthDateInput("0")).toBe("0");
    expect(maskBirthDateInput("0102")).toBe("01.02");
    expect(maskBirthDateInput("01021990")).toBe("01.02.1990");
    expect(maskBirthDateInput("01.02.19901")).toBe("01.02.1990");
    expect(maskBirthDateInput("1а5")).toBe("15");
  });

  it("accepts only a real past date in ДД.ММ.ГГГГ", () => {
    expect(isValidBirthDate("25.03.1975")).toBe(true);
    expect(isValidBirthDate("29.02.2024")).toBe(true);
    expect(isValidBirthDate("31.02.1990")).toBe(false);
    expect(isValidBirthDate("29.02.1990")).toBe(false);
    expect(isValidBirthDate("25.13.1990")).toBe(false);
    expect(isValidBirthDate("1990-02-25")).toBe(false);
    expect(isValidBirthDate("25.3.1975")).toBe(false);
    expect(isValidBirthDate("25.03.1850")).toBe(false);
    expect(isValidBirthDate("01.01.2099")).toBe(false);
    expect(isValidBirthDate("")).toBe(false);
  });

  it("builds profile sheet row with Telegram username", () => {
    expect(CLIENT_BOT_PROFILE_SHEET_HEADERS).toEqual([
      "Дата заполнения",
      "Telegram username",
      "Telegram ID",
      "Имя Фамилия",
      "Игровой никнейм",
      "Номер телефона",
      "Дата рождения",
      "Согласие на участие в рейтинге Majestic",
      "Как узнали",
      "Согласие на уведомления",
      "Пользовательское соглашение",
    ]);

    expect(
      buildClientBotProfileSheetRow({
        answers: {
          agreementAccepted: true,
          birthDate: "01.01.1990",
          discoverySource: "Друг",
          fullName: "Иван Петров",
          nickname: "Ace High",
          notificationsConsent: false,
          phone: "+79990000000",
          ratingConsent: true,
        },
        submittedAt: new Date("2026-05-19T10:20:00.000Z"),
        telegramId: 12345,
        username: "ace_user",
      }),
    ).toEqual([
      "19.05.2026, 13:20",
      "@ace_user",
      12345,
      "Иван Петров",
      "Ace High",
      "+79990000000",
      "01.01",
      "Да",
      "Друг",
      "Нет",
      "Согласен",
    ]);
  });

  it("normalizes birth date in profile sheet row", () => {
    const baseAnswers = {
      agreementAccepted: true,
      discoverySource: "Друг",
      fullName: "Иван Петров",
      nickname: "Ace High",
      notificationsConsent: false,
      phone: "+79990000000",
      ratingConsent: true,
    };

    expect(
      buildClientBotProfileSheetRow({
        answers: { ...baseAnswers, birthDate: "25 марта" },
        submittedAt: new Date("2026-05-19T10:20:00.000Z"),
        telegramId: 12345,
        username: "ace_user",
      })[6],
    ).toBe("25.03");

    expect(
      buildClientBotProfileSheetRow({
        answers: { ...baseAnswers, birthDate: "25.03.1975" },
        submittedAt: new Date("2026-05-19T10:20:00.000Z"),
        telegramId: 12345,
        username: "ace_user",
      })[6],
    ).toBe("25.03");
  });
});
