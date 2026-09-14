import { getTelegramWebApp } from "./layout";
import {
  buildSeatingTables,
  pickRandomSeat,
  pickTableToGrow,
  type SeatingPlayer,
} from "@/lib/tables/seating";

/** The format of every table, or of each one — as the players and sign-ups answers carry it. */
export type TableFormats = number | number[] | null;

export type TableFormatChange = "add" | "remove";

/**
 * The formats an answer carries: one per table, or — from a server deployed before they
 * existed — the chairs every table has.
 */
export function readTableFormatsFrom(
  data: { seatsPerTable?: unknown; tableFormats?: unknown } | null | undefined,
): TableFormats {
  if (Array.isArray(data?.tableFormats)) return data.tableFormats.map(Number);

  const seats = Number(data?.seatsPerTable);
  return seats > 0 ? seats : null;
}

/** Brings a chair to a table or takes one away; the formats of every table come back. */
export async function changeTableFormat(
  initData: string,
  table: number,
  direction: TableFormatChange,
): Promise<number[] | null> {
  const tg = getTelegramWebApp();
  const res = await fetch("/api/tma/tables", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
    body: JSON.stringify({ direction, table }),
  });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    tg?.HapticFeedback.notificationOccurred("error");
    tg?.showAlert(data?.error ?? "Не удалось изменить число мест за столом");
    return null;
  }

  tg?.HapticFeedback.impactOccurred("light");
  return Array.isArray(data?.tableFormats) ? data.tableFormats.map(Number) : null;
}

/** A yes-or-no question for the desk; outside Telegram there is nobody to ask. */
function askTheDesk(question: string) {
  const tg = getTelegramWebApp();
  if (!tg?.showConfirm) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => tg.showConfirm(question, resolve));
}

/**
 * A free chair for the ticket, drawn the way the club seats people.
 *
 * When every table of its kind is full, the desk is asked whether to bring a chair to the
 * table with the fewest players that still has room for one — late players no longer send
 * the admin to the settings. Null when no chair came of it.
 */
export async function drawSeatOrGrowTable({
  initData,
  onFormatsChanged,
  players,
  tableFormats,
  tablesCount,
  ticket,
}: {
  initData: string;
  onFormatsChanged: (formats: number[]) => void;
  players: SeatingPlayer[];
  tableFormats: TableFormats;
  tablesCount: number;
  ticket: "regular" | "vip";
}) {
  const tg = getTelegramWebApp();
  const tables = buildSeatingTables(players, tablesCount, tableFormats);
  const picked = pickRandomSeat(tables, ticket);
  if (picked) return picked;

  const grow = pickTableToGrow(tables, ticket);
  if (!grow) {
    tg?.HapticFeedback.notificationOccurred("error");
    tg?.showAlert(
      ticket === "vip"
        ? "Свободных мест за VIP-столом нет, и больше 10 мест за ним не поставить"
        : "Свободных мест за обычными столами нет, и за каждым уже 10 мест",
    );
    return null;
  }

  const agreed = await askTheDesk(
    `Свободных мест нет. Добавить место за столом ${grow.table}? Он станет ${grow.format} макс.`,
  );
  if (!agreed) return null;

  const formats = await changeTableFormat(initData, grow.table, "add");
  if (!formats) return null;

  onFormatsChanged(formats);
  return pickRandomSeat(buildSeatingTables(players, tablesCount, formats), ticket);
}
