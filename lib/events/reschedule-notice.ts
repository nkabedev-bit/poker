import type { InlineKeyboardMarkup } from "grammy/types";
import { formatEventTimeLabel } from "@/lib/events/types";

/**
 * A game moved to another hour, and everybody holding a seat is asked once whether they
 * can still come.
 *
 * The club learns of such a move a day ahead, with no time to call thirty players one
 * by one. The bot asks each of them with two buttons: "yes" changes nothing, "no" gives
 * the seat back, and the seat goes to the head of the waiting list with the same
 * question, held for an hour. Nobody in the queue hears anything while every seat is
 * still answered for.
 *
 * Kept in code rather than in the database: it is a one-off for one evening, and once
 * that evening has passed the entry does nothing and can go.
 */
export type RescheduleNotice = { eventId: string; text: string };

const RESCHEDULE_NOTICES: readonly RescheduleNotice[] = [
  {
    // Phoenix, 8 November 2026: moved from 17:00 to 13:00.
    eventId: "e731137e-5c31-49b1-bb57-2a4cafc84168",
    text:
      "⚠️ ВАЖНО: PHOENIX В ВОСКРЕСЕНЬЕ НАЧНЁТСЯ В 13:00\n\n" +
      "8 ноября стартуем в 13:00 вместо 17:00. Время изменилось по независящим от нас причинам.\n\n" +
      "Пожалуйста, ответьте сможете ли вы присутствовать",
  },
];

/**
 * How long a seat given back over the move is held for the player in the queue it was
 * offered to. Longer than the usual half hour: the question is not "the seat is yours,
 * come and take it" but "can you come at another time", and that takes a moment to
 * answer.
 */
export const RESCHEDULE_ANSWER_MINUTES = 60;

export function findRescheduleNotice(eventId: string): RescheduleNotice | null {
  return RESCHEDULE_NOTICES.find((notice) => notice.eventId === eventId) ?? null;
}

/** What the two buttons send back: resched:yes:<event id>. */
const RESCHEDULE_PREFIX = "resched";

export type RescheduleAnswer = { accept: boolean; eventId: string };

export function buildRescheduleKeyboard(eventId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { callback_data: `${RESCHEDULE_PREFIX}:yes:${eventId}`, text: "Да" },
      { callback_data: `${RESCHEDULE_PREFIX}:no:${eventId}`, text: "Нет" },
    ]],
  };
}

/** Null for any other button, so the rest keep their own path. */
export function parseRescheduleCallback(data: string | undefined): RescheduleAnswer | null {
  const match = /^resched:(yes|no):([\w-]{1,64})$/.exec(data ?? "");
  if (!match) return null;

  return { accept: match[1] === "yes", eventId: match[2] };
}

/**
 * The same question, put to the player in the queue a seat was freed for. Without the
 * last line they would read it as a question about a seat they never had.
 */
export function rescheduleWaitlistText(notice: RescheduleNotice, expiresAt: Date) {
  return (
    `${notice.text}\n\n` +
    "Вы в листе ожидания, и для вас освободилось место — держим его до " +
    `${formatEventTimeLabel(expiresAt.toISOString())}. Ответьте «Да», и оно ваше.`
  );
}

/** Their hour passed in silence, and the seat went on down the line. */
export function rescheduleMissedText(eventTitle: string) {
  return (
    `Час прошёл — место на «${eventTitle}» больше не держим за вами: ` +
    "очередь пошла дальше. Вы остаётесь в листе ожидания."
  );
}

export type RescheduleOutcome =
  | { kind: "blocked"; message: string }
  | { kind: "closed" }
  | { kind: "confirmed" }
  | { kind: "left_queue" }
  | { kind: "no_signup" }
  | { kind: "pair_handed_over" }
  | { kind: "released" }
  | { kind: "seat_gone" }
  | { kind: "seated_from_queue" };

function outcomeLine(outcome: RescheduleOutcome) {
  switch (outcome.kind) {
    case "blocked":
      return outcome.message;
    case "closed":
      return "Запись на этот турнир уже закрыта — ответ ничего не меняет.";
    case "confirmed":
      return "✅ Вы ответили «Да». Ждём вас!";
    case "left_queue":
      return "Вы ответили «Нет» — убрали вас из листа ожидания. Спасибо, что ответили!";
    case "no_signup":
      return "Вашей записи на этот турнир уже нет.";
    case "pair_handed_over":
      return "Вы ответили «Нет» — бронь снята. Билет 1+1 перешёл вашему напарнику.";
    case "released":
      return "Вы ответили «Нет» — бронь снята. Спасибо, что предупредили!";
    case "seat_gone":
      return "Место уже ушло следующему в очереди. Вы остаётесь в листе ожидания.";
    case "seated_from_queue":
      return "✅ Готово, вы записаны! Ждём вас.";
  }
}

/**
 * What the question turns into once answered: the notice stays for reference, the
 * buttons go, and the player reads what came of their tap.
 */
export function rescheduleAnswerText(notice: RescheduleNotice, outcome: RescheduleOutcome) {
  return `${notice.text}\n\n${outcomeLine(outcome)}`;
}

/** Told to the +1 when the buyer of their "1+1" cannot come and the ticket is theirs now. */
export function pairHandedOverMessage(eventTitle: string) {
  return (
    `Владелец билета 1+1 на «${eventTitle}» не сможет прийти, и билет теперь ваш. ` +
    "Можете пригласить напарника в приложении."
  );
}
