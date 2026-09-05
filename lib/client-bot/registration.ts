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

export const CLIENT_BOT_WELCOME_TEXT =
  "Добро пожаловать!\n\nТурниры, рейтинг и сервис клуба — в приложении. Открой его кнопкой ниже.";

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

export function getClientMiniAppUrl() {
  const explicit = process.env.CLIENT_TMA_URL?.trim();
  if (explicit) return explicit;

  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host.replace(/\/+$/, "")}/client` : "";
}

/**
 * The bot's only keyboard: a single button into the mini-app. Without a configured
 * URL the button is dropped rather than sent broken — the welcome text still lands.
 */
export function buildClientMiniAppReplyMarkup() {
  const miniAppUrl = getClientMiniAppUrl();

  return {
    inline_keyboard: miniAppUrl
      ? [[{ text: "🎰 Открыть приложение", web_app: { url: miniAppUrl } }]]
      : [],
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

/**
 * Игрок набирает дату рождения цифрами на числовой клавиатуре — точки расставляются
 * по мере ввода: 01021990 → 01.02.1990.
 */
export function maskBirthDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)];

  return parts.filter((part) => part.length > 0).join(".");
}

export function isValidBirthDate(value: string) {
  const match = normalizeClientBotText(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return false;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC перекручивает лишние дни в следующий месяц — сверка полей ловит 31.02.
  return (
    year >= 1900 &&
    date.getUTCDate() === day &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCFullYear() === year &&
    date.getTime() <= Date.now()
  );
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
  /** Empty for a player who signed in on the web and has no Telegram account. */
  telegramId: number | null;
  username: string | null;
}) {
  return [
    formatProfileSubmittedAt(submittedAt),
    formatTelegramUsername(username),
    telegramId ?? "",
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
