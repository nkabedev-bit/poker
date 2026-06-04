import type { TournamentPlayer } from "@/lib/timer/types";

export function normalizeClientBotText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isRegistrationCodeMatch(input: string, code: string) {
  const normalizedInput = normalizeClientBotText(input).toLocaleLowerCase("ru-RU");
  const normalizedCode = normalizeClientBotText(code).toLocaleLowerCase("ru-RU");

  return normalizedCode.length > 0 && normalizedInput === normalizedCode;
}

export function buildClientBotPlayer({
  name,
  startingStack,
  telegramId,
}: {
  name: string;
  startingStack: number;
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
    table: null,
    telegramId,
  };
}
