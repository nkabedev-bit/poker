import type { TournamentPlayer } from "@/lib/timer/types";

export type ClientBotProfileStepId =
  | "fullName"
  | "nickname"
  | "phone"
  | "birthDate"
  | "ratingConsent"
  | "discoverySource"
  | "notificationsConsent"
  | "agreementAccepted";

export type ClientBotProfileAnswers = {
  agreementAccepted: boolean;
  birthDate: string;
  discoverySource: string;
  fullName: string;
  nickname: string;
  notificationsConsent: boolean;
  phone: string;
  ratingConsent: boolean;
};

export const CLIENT_BOT_PROFILE_INTRO_TEXT =
  "Привет! Заполни, пожалуйста, анкету и после этого ты сможешь зарегистрироваться на игру!";

export const CLIENT_BOT_PROFILE_STEPS: {
  id: ClientBotProfileStepId;
  question: string;
  type: "text" | "yes_no" | "agreement";
}[] = [
  { id: "fullName", question: "Имя Фамилия", type: "text" },
  {
    id: "nickname",
    question:
      "Игровой никнейм. ВАЖНО! Если вы уже участвовали в турнирах - вводите никнейм, который у вас был в прошлых играх.",
    type: "text",
  },
  { id: "phone", question: "Номер телефона", type: "text" },
  { id: "birthDate", question: "Дата рождения", type: "text" },
  {
    id: "ratingConsent",
    question: "Согласие на участие в рейтинге Majestic",
    type: "yes_no",
  },
  { id: "discoverySource", question: "Как вы о нас узнали?", type: "text" },
  {
    id: "notificationsConsent",
    question: "Согласие на получение уведомление о будущих играх Majestic",
    type: "yes_no",
  },
  {
    id: "agreementAccepted",
    question:
      "Я ознакомлен с положением и принимаю пользовательское соглашение и соблюдаю правила сообщества (ключевое: фишки НЕ имеют денежного эквивалента, турнир проводится БЕЗ денежных призов, встреча НЕ является игорной деятельностью)",
    type: "agreement",
  },
];

export const CLIENT_BOT_PROFILE_SHEET_HEADERS = [
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
];

const russianMonthNumbers: Record<string, string> = {
  апреля: "04",
  август: "08",
  августа: "08",
  декабр: "12",
  декабря: "12",
  июл: "07",
  июля: "07",
  июн: "06",
  июня: "06",
  май: "05",
  мая: "05",
  март: "03",
  марта: "03",
  ноябр: "11",
  ноября: "11",
  октябр: "10",
  октября: "10",
  сентябр: "09",
  сентября: "09",
  феврал: "02",
  февраля: "02",
  январ: "01",
  января: "01",
};

export function normalizeClientBotText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isRegistrationCodeMatch(input: string, code: string) {
  const normalizedInput = normalizeClientBotText(input).toLocaleLowerCase("ru-RU");
  const normalizedCode = normalizeClientBotText(code).toLocaleLowerCase("ru-RU");

  return normalizedCode.length > 0 && normalizedInput === normalizedCode;
}

export function buildNicknameConfirmationText(name: string) {
  const normalizedName = normalizeClientBotText(name);

  return `Вы правильно ввели никнейм: ${normalizedName}?\nОн закрепится за вами и изменить его впоследствии будет нельзя.`;
}

export function buildProfileNicknameConfirmationText(name: string) {
  return `ваш никнейм ${normalizeClientBotText(name)}, верно?`;
}

export function buildQuestionnaireStepReplyMarkup(stepId: ClientBotProfileStepId) {
  const step = CLIENT_BOT_PROFILE_STEPS.find((item) => item.id === stepId);
  if (!step || step.type === "text") return undefined;

  if (step.type === "agreement") {
    return {
      inline_keyboard: [
        [{ callback_data: `profile_answer:${stepId}:yes`, text: "согласен" }],
      ],
    };
  }

  return {
    inline_keyboard: [
      [
        { callback_data: `profile_answer:${stepId}:yes`, text: "Да" },
        { callback_data: `profile_answer:${stepId}:no`, text: "Нет" },
      ],
    ],
  };
}

function formatProfileSubmittedAt(submittedAt: Date) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).formatToParts(submittedAt);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.day}.${byType.month}.${byType.year}, ${byType.hour}:${byType.minute}`;
}

function formatTelegramUsername(username: string | null) {
  const normalized = normalizeClientBotText(username ?? "");
  if (!normalized) return "";

  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

export function formatClientBotBirthDateForSheet(value: string) {
  const normalized = normalizeClientBotText(value).toLocaleLowerCase("ru-RU");
  const numericMatch = normalized.match(/^(\d{1,2})[.\-/](\d{1,2})(?:[.\-/]\d{2,4})?$/);
  if (numericMatch) {
    return `${numericMatch[1].padStart(2, "0")}.${numericMatch[2].padStart(2, "0")}`;
  }

  const textMatch = normalized.match(/^(\d{1,2})\s+([а-яё]+)(?:\s+\d{2,4})?$/u);
  if (textMatch) {
    const month = russianMonthNumbers[textMatch[2]];
    if (month) return `${textMatch[1].padStart(2, "0")}.${month}`;
  }

  return value;
}

export function buildClientBotProfileSheetRow({
  answers,
  submittedAt,
  telegramId,
  username,
}: {
  answers: ClientBotProfileAnswers;
  submittedAt: Date;
  telegramId: number;
  username: string | null;
}) {
  return [
    formatProfileSubmittedAt(submittedAt),
    formatTelegramUsername(username),
    telegramId,
    answers.fullName,
    answers.nickname,
    answers.phone,
    formatClientBotBirthDateForSheet(answers.birthDate),
    answers.ratingConsent ? "Да" : "Нет",
    answers.discoverySource,
    answers.notificationsConsent ? "Да" : "Нет",
    answers.agreementAccepted ? "Согласен" : "",
  ];
}

export function buildTableSelectionReplyMarkup(tablesCount: number) {
  const safeTablesCount = Math.max(1, Math.floor(tablesCount));
  const buttons = Array.from({ length: safeTablesCount }, (_, index) => ({
    callback_data: `table_select:${index + 1}`,
    text: String(index + 1),
  }));
  const inline_keyboard = [];

  for (let index = 0; index < buttons.length; index += 3) {
    inline_keyboard.push(buttons.slice(index, index + 3));
  }

  return { inline_keyboard };
}

export function buildClientBotPlayer({
  name,
  startingStack,
  tableNumber,
  telegramId,
}: {
  name: string;
  startingStack: number;
  tableNumber: number;
  telegramId: number;
}): TournamentPlayer {
  return {
    addons: 0,
    bountyChipsTotal: 0,
    bountyCount: 0,
    finishPlace: null,
    id: crypto.randomUUID(),
    name: normalizeClientBotText(name),
    rebuys: 0,
    registeredVia: "client_bot",
    seat: null,
    stack: startingStack,
    status: "active",
    table: tableNumber,
    telegramId,
  };
}
