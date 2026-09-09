import type { TableMerge } from "@/lib/timer/types";

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
