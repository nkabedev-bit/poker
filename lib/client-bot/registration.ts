import type { TournamentPlayer } from "@/lib/timer/types";

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
