import type { TableMerge, TableMove } from "@/lib/timer/types";

/**
 * What the room reads while a table is being broken up. The floor calls it once and the
 * screens carry the wording, so the same thing is announced at every table.
 */
export const TABLE_MERGE_NOTICE = {
  label: "Техническая пауза",
  title: "ОБЪЕДИНЕНИЕ СТОЛОВ",
  detail: "Заканчиваем раздачу, после чего идёт расформирование стола и пересадка",
} as const;

/** A reseating announcement, as far as anything can tell from stored JSON. */
export function isTableMerge(value: unknown): value is TableMerge {
  if (!value || typeof value !== "object") return false;

  const startedAt = (value as { startedAt?: unknown }).startedAt;
  return typeof startedAt === "string" && !Number.isNaN(new Date(startedAt).getTime());
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isTableMove(value: unknown): value is TableMove {
  if (!value || typeof value !== "object") return false;

  const move = value as Partial<Record<keyof TableMove, unknown>>;
  return (
    typeof move.name === "string" &&
    move.name.trim().length > 0 &&
    typeof move.playerId === "string" &&
    isPositiveInteger(move.table) &&
    isPositiveInteger(move.seat) &&
    typeof move.seatLabel === "string" &&
    move.seatLabel.length > 0
  );
}

/**
 * The announcement as stored, with anything a screen could not draw left out: a move
 * without a table or a chair would send somebody nowhere.
 */
export function readTableMerge(value: unknown): TableMerge | null {
  if (!isTableMerge(value)) return null;

  const { brokenTable, moves } = value;
  const readable = Array.isArray(moves) ? moves.filter(isTableMove) : [];

  return {
    startedAt: value.startedAt,
    ...(isPositiveInteger(brokenTable) ? { brokenTable } : {}),
    ...(readable.length > 0 ? { moves: readable } : {}),
  };
}

/** Where a player is going, the way the dealer says it: "стол 1, место 2/3". */
export function formatTableMoveTarget(move: Pick<TableMove, "seatLabel" | "table">) {
  return `стол ${move.table}, место ${move.seatLabel}`;
}

/** One line of the announcement: "Chura пересаживается за стол 1, место 3". */
export function describeTableMove(move: TableMove) {
  return `${move.name} пересаживается за ${formatTableMoveTarget(move)}`;
}
