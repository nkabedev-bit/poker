import { describe, expect, it } from "vitest";
import {
  appendClientBotMainMenuButton,
  buildClientBotMainMenuButtonReplyMarkup,
  buildClientBotMainMenuReplyMarkup,
  buildClientBotProfileSheetRow,
  buildClientBotPlayer,
  buildClientBotRegistrationSuccessText,
  buildNicknameConfirmationText,
  buildProfileNicknameConfirmationText,
  buildQuestionnaireStepReplyMarkup,
  CLIENT_BOT_PROFILE_INTRO_TEXT,
  CLIENT_BOT_REGISTRATION_FULL_MESSAGE,
  CLIENT_BOT_PROFILE_SHEET_HEADERS,
  CLIENT_BOT_PROFILE_STEPS,
  buildTableSelectionReplyMarkup,
  isRegistrationCodeMatch,
  normalizeClientBotText,
} from "@/lib/client-bot/registration";

describe("client bot registration", () => {
  it("compares registration code after trimming and lowercasing", () => {
    expect(isRegistrationCodeMatch(" River ", "river")).toBe(true);
    expect(isRegistrationCodeMatch("river", "turn")).toBe(false);
    expect(isRegistrationCodeMatch("river", "")).toBe(false);
  });

  it("normalizes user-entered text", () => {
    expect(normalizeClientBotText("  Иван\nПетров  ")).toBe("Иван Петров");
  });

  it("builds an active tournament player from a registered Telegram user", () => {
    const player = buildClientBotPlayer({
      name: "Ace High",
      startingStack: 15000,
      tableNumber: 2,
      telegramId: 12345,
    });

    expect(player).toMatchObject({
      addons: 0,
      bountyCount: 0,
      finishPlace: null,
      name: "Ace High",
      rebuys: 0,
      registeredVia: "client_bot",
      seat: null,
      stack: 15000,
      status: "active",
      table: 2,
      telegramId: 12345,
    });
    expect(player.id).toEqual(expect.any(String));
  });

  it("builds registration success text with the player number", () => {
    expect(
      buildClientBotRegistrationSuccessText({
        name: "Ace High",
        registrationNumber: 17,
      }),
    ).toBe("Вы зарегистрированы. Ваш номер - 17");
  });

  it("defines the full-capacity registration text", () => {
    expect(CLIENT_BOT_REGISTRATION_FULL_MESSAGE).toBe(
      "Все места заняты, уточните ситуацию у админов",
    );
  });

  it("builds nickname confirmation text before the nickname is locked", () => {
    expect(buildNicknameConfirmationText("Ace High")).toBe(
      "Вы правильно ввели никнейм: Ace High?\nОн закрепится за вами и изменить его впоследствии будет нельзя.",
    );
  });

  it("builds table number buttons from tournament settings", () => {
    expect(buildTableSelectionReplyMarkup(5)).toEqual({
      inline_keyboard: [
        [
          { callback_data: "table_select:1", text: "1" },
          { callback_data: "table_select:2", text: "2" },
          { callback_data: "table_select:3", text: "3" },
        ],
        [
          { callback_data: "table_select:4", text: "4" },
          { callback_data: "table_select:5", text: "5" },
        ],
      ],
    });
  });

  it("builds inline main menu controls for post-profile bot messages", () => {
    expect(buildClientBotMainMenuReplyMarkup()).toEqual({
      inline_keyboard: [
        [{ callback_data: "client_menu:registration", text: "Регистрация" }],
        [{ callback_data: "client_menu:rating", text: "Рейтинговая таблица" }],
        [{ callback_data: "client_menu:schedule", text: "Расписание турниров" }],
      ],
    });

    expect(buildClientBotMainMenuButtonReplyMarkup()).toEqual({
      inline_keyboard: [[{ callback_data: "client_menu:main", text: "Главное меню" }]],
    });

    expect(
      appendClientBotMainMenuButton({
        inline_keyboard: [[{ callback_data: "table_select:1", text: "1" }]],
      }),
    ).toEqual({
      inline_keyboard: [
        [{ callback_data: "table_select:1", text: "1" }],
        [{ callback_data: "client_menu:main", text: "Главное меню" }],
      ],
    });
  });

  it("defines profile questionnaire steps in the requested order", () => {
    expect(CLIENT_BOT_PROFILE_INTRO_TEXT).toBe(
      "Привет! Заполни, пожалуйста, анкету и после этого ты сможешь зарегистрироваться на игру!",
    );

    expect(CLIENT_BOT_PROFILE_STEPS.map((step) => step.question)).toEqual([
      "Имя Фамилия",
      "Игровой никнейм. ВАЖНО! Если вы уже участвовали в турнирах - вводите никнейм, который у вас был в прошлых играх.",
      "Номер телефона",
      "Дата рождения",
      "Согласие на участие в рейтинге Majestic",
      "Как вы о нас узнали?",
      "Согласие на получение уведомление о будущих играх Majestic",
      "Я ознакомлен с положением и принимаю пользовательское соглашение и соблюдаю правила сообщества (ключевое: фишки НЕ имеют денежного эквивалента, турнир проводится БЕЗ денежных призов, встреча НЕ является игорной деятельностью)",
    ]);
  });

  it("builds inline controls for questionnaire choice steps", () => {
    expect(buildQuestionnaireStepReplyMarkup("ratingConsent")).toEqual({
      inline_keyboard: [
        [
          { callback_data: "profile_answer:ratingConsent:yes", text: "Да" },
          { callback_data: "profile_answer:ratingConsent:no", text: "Нет" },
        ],
      ],
    });
    expect(buildQuestionnaireStepReplyMarkup("agreementAccepted")).toEqual({
      inline_keyboard: [
        [{ callback_data: "profile_answer:agreementAccepted:yes", text: "согласен" }],
      ],
    });
    expect(buildQuestionnaireStepReplyMarkup("nickname")).toBeUndefined();
  });

  it("builds profile nickname confirmation text", () => {
    expect(buildProfileNicknameConfirmationText(" Ace  High ")).toBe(
      "ваш никнейм Ace High, верно?",
    );
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
