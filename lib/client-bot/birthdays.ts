import { normalizeClientBotText } from "@/lib/client-bot/registration";

/** One account, as much of it as a birthday needs. */
export type BirthdayAccount = {
  display_name: string | null;
  pending_profile_answers: { birthDate?: unknown } | null;
};

export type Birthday = {
  /** Day and month as the club writes them: "14.04". */
  date: string;
  day: number;
  month: number;
  nickname: string;
};

const MONTH_NAMES = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

/**
 * The day and month of a birth date, whichever way it was written down.
 *
 * A questionnaire filled in the app carries the year; one carried over from the club's
 * spreadsheet does not. Neither matters here — a birthday comes round on a day and a
 * month.
 */
export function readBirthDay(value: unknown): { day: number; month: number } | null {
  const text = normalizeClientBotText(typeof value === "string" ? value : "");
  const match = text.match(/^(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return { day, month };
}

/** Today in Moscow, which is the day the club lives by. */
export function moscowToday(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).formatToParts(now);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return { day: read("day"), month: read("month"), year: read("year") };
}

function toBirthdays(accounts: BirthdayAccount[]): Birthday[] {
  const seen = new Set<string>();
  const found: Birthday[] = [];

  for (const account of accounts) {
    const nickname = (account.display_name ?? "").trim();
    if (!nickname) continue;

    const born = readBirthDay(account.pending_profile_answers?.birthDate);
    if (!born) continue;

    // One greeting per player, however many rows carry the name.
    const key = nickname.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) continue;
    seen.add(key);

    found.push({
      date: `${String(born.day).padStart(2, "0")}.${String(born.month).padStart(2, "0")}`,
      day: born.day,
      month: born.month,
      nickname,
    });
  }

  return found;
}

/** Whose birthday it is today. */
export function pickBirthdaysToday(accounts: BirthdayAccount[], now: Date): Birthday[] {
  const today = moscowToday(now);

  return toBirthdays(accounts).filter(
    (birthday) => birthday.day === today.day && birthday.month === today.month,
  );
}

/** Everyone with a birthday in one month, in the order the days come round. */
export function pickBirthdaysInMonth(accounts: BirthdayAccount[], month: number): Birthday[] {
  return toBirthdays(accounts)
    .filter((birthday) => birthday.month === month)
    .sort((a, b) => a.day - b.day || a.nickname.localeCompare(b.nickname, "ru-RU"));
}

/** The month after the one the club is living, December rolling into January. */
export function moscowNextMonth(now: Date) {
  return (moscowToday(now).month % 12) + 1;
}

/**
 * The day the club wants the month ahead.
 *
 * The twentieth, by the admins' own choosing: far enough into the month that whoever
 * plans the evenings still has time to arrange something for the birthdays coming.
 */
export const MONTH_DIGEST_DAY = 20;

export function isMonthDigestDay(now: Date) {
  return moscowToday(now).day === MONTH_DIGEST_DAY;
}

export function monthName(month: number) {
  return MONTH_NAMES[month - 1] ?? "";
}

/** The coming birthdays, nearest first — what the /birthday command answers with. */
export function pickUpcomingBirthdaysFromAccounts(
  accounts: BirthdayAccount[],
  now: Date,
  days: number,
): Array<Birthday & { daysUntil: number }> {
  const today = moscowToday(now);
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);

  return toBirthdays(accounts)
    .map((birthday) => {
      const thisYear = Date.UTC(today.year, birthday.month - 1, birthday.day);
      const next = thisYear < todayMs ? Date.UTC(today.year + 1, birthday.month - 1, birthday.day) : thisYear;

      return { ...birthday, daysUntil: Math.round((next - todayMs) / 86_400_000) };
    })
    .filter((birthday) => birthday.daysUntil <= days)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.nickname.localeCompare(b.nickname, "ru-RU"));
}
