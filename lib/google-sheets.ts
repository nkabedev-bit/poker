import { google, type sheets_v4 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPlayerCharge,
  getFinancePrices,
  type FinancePrices,
} from "@/lib/finance/player-charge";
import {
  buildClientBotProfileSheetRow,
  CLIENT_BOT_PROFILE_SHEET_HEADERS,
  formatClientBotBirthDateForSheet,
  type ClientBotProfileAnswers,
} from "@/lib/client-bot/registration";
import { buildPtsStandingsRows, isSideBountyPoints, PTS_PLACE_COUNT, type PtsStandingRow } from "@/lib/pts-rating";
import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

const ELIMINATION_SHEET_HEADERS = [
  "Вылетел",
  "Кто получает баунти",
  "Время вылета",
  "Ре-энтри",
  "",
  "Место",
  "Игрок",
  "PTS",
  "Кол-во баунти",
];

const VIP_SHEET_NAME = "VIP";
const VIP_SHEET_HEADERS = ["Игрок", "Раз в VIP"];
// Game-date columns start after the summary (A, B) and a spacer column (C).
const VIP_FIRST_GAME_COLUMN_INDEX = 3;

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const MOSCOW_UTC_OFFSET_HOURS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type MoscowDateParts = {
  day: number;
  month: number;
  year: number;
};

type BountyLogSheetRow = {
  eliminated_name: string | null;
  killers: unknown;
  players_after?: unknown;
  recorded_at: string | null;
  uses_reentry: boolean | null;
  reentry_double?: boolean | null;
};

function getMoscowDateParts(date = new Date()): MoscowDateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: MOSCOW_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    day: value("day"),
    month: value("month"),
    year: value("year"),
  };
}

function getSheetNameForDate(date = new Date()) {
  const { day, month } = getMoscowDateParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}

function getTodaySheetName(date = new Date()) {
  return getSheetNameForDate(date);
}

export function getMoscowDayRange(date = new Date()) {
  const { day, month, year } = getMoscowDateParts(date);
  const startMs = Date.UTC(year, month - 1, day) - MOSCOW_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  const endMs = startMs + MS_PER_DAY;

  return {
    endIso: new Date(endMs).toISOString(),
    startIso: new Date(startMs).toISOString(),
  };
}

export function getEliminationSheetName(sessionStartedAt?: string | null) {
  return getTodaySheetName(sessionStartedAt ? new Date(sessionStartedAt) : new Date());
}

// A single game (registration + play) fits comfortably in this window, while the gap to
// the next game is typically ~a day. So a session younger than this belongs to the current
// game; an older one is a leftover from a previous game whose session was never reset.
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Decide whether a stored sheets-session timestamp still describes the current game. We use
// its AGE rather than the calendar day so a game that runs past midnight keeps a single date
// label (no split at 00:00), while a stale timestamp from an earlier game is ignored — the
// sheets then fall back to the real current date automatically, with no `/clearsheet` needed
// between games.
export function getEffectiveSessionStart(
  sessionStartedAt: string | null | undefined,
  now = new Date(),
): string | null {
  if (!sessionStartedAt) return null;

  const started = new Date(sessionStartedAt);
  if (Number.isNaN(started.getTime())) return null;

  const age = now.getTime() - started.getTime();
  if (age > SESSION_MAX_AGE_MS) return null;

  return sessionStartedAt;
}

function formatMoscowTime(value: string | null) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MOSCOW_TIME_ZONE,
  });
}

function getKillerNames(killers: unknown) {
  if (!Array.isArray(killers)) return "—";
  const names = killers
    .map((killer) => {
      if (!killer || typeof killer !== "object") return "";
      const name = (killer as { name?: unknown }).name;
      return typeof name === "string" ? name.trim() : "";
    })
    .filter(Boolean);

  return names.join(" / ") || "—";
}

export function buildEliminationSheetRows(logs: BountyLogSheetRow[]) {
  return logs.map((log) => [
    log.eliminated_name || "",
    getKillerNames(log.killers),
    formatMoscowTime(log.recorded_at),
    log.uses_reentry ? (log.reentry_double ? "Да x2" : "Да") : "",
  ]);
}

function isTournamentPlayers(value: unknown): value is TournamentPlayer[] {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const player = item as Partial<TournamentPlayer>;
    return typeof player.id === "string" && typeof player.name === "string";
  });
}

export function getSheetStandingsPlayers(
  currentPlayers: TournamentPlayer[],
  logs: BountyLogSheetRow[],
) {
  if (currentPlayers.length > 0) return currentPlayers;

  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const playersAfter = logs[index]?.players_after;
    if (isTournamentPlayers(playersAfter)) return playersAfter;
  }

  return currentPlayers;
}

function isVipPlayer(player: TournamentPlayer) {
  // VIP membership is decided purely by the registration number range
  // (lib/player-registration-number.ts), so a stale/missing category cannot
  // mis-classify a player.
  return isVipRegistrationNumber(player.registrationNumber);
}

// Names of players who registered as VIP (registration number 21-30 / table 3),
// in registration order, de-duplicated.
export function getVipPlayersForGame(players: TournamentPlayer[]) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const player of players) {
    if (!isVipPlayer(player)) continue;
    const name = player.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  return names;
}

type VipGameColumn = { date: string; names: string[] };
type VipSummaryEntry = { name: string; count: number };

function parseVipGameColumns(grid: string[][]): VipGameColumn[] {
  const headerRow = grid[0] ?? [];
  const columns: VipGameColumn[] = [];

  for (let col = VIP_FIRST_GAME_COLUMN_INDEX; col < headerRow.length; col += 1) {
    const date = String(headerRow[col] ?? "").trim();
    if (!date) continue;

    const names: string[] = [];
    for (let row = 1; row < grid.length; row += 1) {
      const name = String(grid[row]?.[col] ?? "").trim();
      if (name) names.push(name);
    }

    columns.push({ date, names });
  }

  return columns;
}

// Read the existing A/B summary (player name + "Раз в VIP" count) as-is, preserving order.
// Counts are preserved (not recomputed) so manual edits and prior games survive.
function parseVipSummary(grid: string[][]): VipSummaryEntry[] {
  const summary: VipSummaryEntry[] = [];

  for (let row = 1; row < grid.length; row += 1) {
    const name = String(grid[row]?.[0] ?? "").trim();
    if (!name) continue;
    const count = Number(grid[row]?.[1]);
    summary.push({ name, count: Number.isFinite(count) ? count : 0 });
  }

  return summary;
}

// Additively merge today's VIP players into the VIP grid. This NEVER removes a name,
// blanks a column, or drops a summary row — it only appends newly-seen VIP players to
// today's game column and bumps their "Раз в VIP" counter by 1 (once per game, because a
// name already present in today's column is skipped on repeat syncs). The A/B summary is
// preserved as read, so manual edits and previously recorded games are kept intact.
export function buildVipSheetGrid(
  existingGrid: string[][],
  todayDate: string,
  todayNames: string[],
): (string | number)[][] {
  const columns = parseVipGameColumns(existingGrid);
  const summary = parseVipSummary(existingGrid);
  const summaryIndex = new Map(summary.map((entry, index) => [entry.name, index]));

  let todayColumn = columns.find((column) => column.date === todayDate);
  if (!todayColumn && todayNames.length > 0) {
    todayColumn = { date: todayDate, names: [] };
    columns.push(todayColumn);
  }

  if (todayColumn) {
    const alreadyRecorded = new Set(todayColumn.names);
    for (const name of todayNames) {
      if (alreadyRecorded.has(name)) continue;
      alreadyRecorded.add(name);
      todayColumn.names.push(name);

      const existing = summaryIndex.get(name);
      if (existing === undefined) {
        summaryIndex.set(name, summary.length);
        summary.push({ name, count: 1 });
      } else {
        summary[existing].count += 1;
      }
    }
  }

  return serializeVipGrid(summary, columns);
}

function serializeVipGrid(
  summary: VipSummaryEntry[],
  columns: VipGameColumn[],
): (string | number)[][] {
  const bodyRowCount = Math.max(
    summary.length,
    ...columns.map((column) => column.names.length),
    0,
  );

  const grid: (string | number)[][] = [
    [
      VIP_SHEET_HEADERS[0],
      VIP_SHEET_HEADERS[1],
      "",
      ...columns.map((column) => column.date),
    ],
  ];

  for (let row = 0; row < bodyRowCount; row += 1) {
    const summaryEntry = summary[row];
    const line: (string | number)[] = [
      summaryEntry ? summaryEntry.name : "",
      summaryEntry ? summaryEntry.count : "",
      "",
      ...columns.map((column) => column.names[row] ?? ""),
    ];
    grid.push(line);
  }

  return grid;
}

// Remove a single player from the given game's VIP column and decrement their "Раз в VIP"
// counter by 1 (dropping the summary row at 0). Used to correct an erroneous VIP entry when
// an admin deletes the player. Only touches the named player in the named game's column —
// other games, other players, and manual edits are left untouched. No-op if the player is
// not in that column.
export function removeFromVipSheetGrid(
  existingGrid: string[][],
  gameDate: string,
  playerName: string,
): (string | number)[][] {
  const columns = parseVipGameColumns(existingGrid);
  const summary = parseVipSummary(existingGrid);

  const gameColumn = columns.find((column) => column.date === gameDate);
  const nameIndex = gameColumn ? gameColumn.names.indexOf(playerName) : -1;
  if (!gameColumn || nameIndex === -1) {
    return serializeVipGrid(summary, columns);
  }

  gameColumn.names.splice(nameIndex, 1);
  if (gameColumn.names.length === 0) {
    columns.splice(columns.indexOf(gameColumn), 1);
  }

  const summaryIndex = summary.findIndex((entry) => entry.name === playerName);
  if (summaryIndex !== -1) {
    summary[summaryIndex].count -= 1;
    if (summary[summaryIndex].count <= 0) {
      summary.splice(summaryIndex, 1);
    }
  }

  return serializeVipGrid(summary, columns);
}

export function getCurrentEliminationSheetName() {
  return getEliminationSheetName();
}

async function getAuth() {
  try {
    const credsStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "";
    const credentials = JSON.parse(credsStr);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } catch (err) {
    console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY", err);
    throw err;
  }
}

// Create the tab if it is missing. Costs no write request when the tab already exists, which
// is every sync after the first one of a game.
async function ensureSheetExists(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s: sheets_v4.Schema$Sheet) => s.properties?.title === sheetName
  );

  if (exists) return;

  try {
    await withRateLimitRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: { properties: { title: sheetName } },
            },
          ],
        },
      }),
    );
  } catch {
    console.log("Sheet creation race condition handled");
  }
}

async function getOrCreateSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  headers = ELIMINATION_SHEET_HEADERS,
) {
  await ensureSheetExists(sheets, spreadsheetId, sheetName);
  await updateSheetHeaders(sheets, spreadsheetId, sheetName, headers);
}

async function updateSheetHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  headers = ELIMINATION_SHEET_HEADERS,
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1:${getSheetColumnName(headers.length)}1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [headers],
    },
  });
}

function getSheetColumnName(columnNumber: number) {
  let value = Math.max(1, Math.floor(columnNumber));
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

type SheetValueRange = {
  range: string;
  values: (string | number)[][];
};

// Google Sheets allows 60 write requests per minute per user (the service account is one
// user). A full tournament sync used to cost 9 writes, so eight knockouts inside a minute
// blew the quota and the sync died mid-way — see the 2026-08-30 incident, where a burst of
// rapid eliminations left the sheet behind the database. Batching every block of a sheet
// into one values.batchUpdate per valueInputOption brings a sync down to 2 writes, and the
// blocks land atomically: no clear-then-fail window that can blank a populated sheet.
async function batchUpdateValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  valueInputOption: "RAW" | "USER_ENTERED",
  data: SheetValueRange[],
) {
  if (data.length === 0) return;

  await withRateLimitRetry(() =>
    sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { data, valueInputOption },
    }),
  );
}

function isRateLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const status = (error as { code?: unknown; status?: unknown }).code
    ?? (error as { status?: unknown }).status;
  if (Number(status) === 429) return true;
  return String((error as { message?: unknown }).message ?? "").includes("Quota exceeded");
}

const RATE_LIMIT_RETRY_DELAYS_MS = [1500, 4000];

// The per-minute quota is a sliding window, so a burst that trips it clears within seconds.
// One or two spaced retries turn a transient 429 into a completed write instead of a sync
// that dies and silently leaves the sheet stale.
async function withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= RATE_LIMIT_RETRY_DELAYS_MS.length || !isRateLimitError(error)) throw error;
      console.warn(
        `Google Sheets rate-limited; retrying in ${RATE_LIMIT_RETRY_DELAYS_MS[attempt]}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_DELAYS_MS[attempt]));
    }
  }
}

// Blank rows appended past the real data so a shrinking block (a cancelled elimination, a
// removed player) overwrites its own stale tail. This replaces the values.clear that used to
// precede every block write: the clear cost a request of its own and, worse, left the sheet
// wiped whenever the write that should have followed it failed.
function padRowsToClearTail(
  rows: (string | number)[][],
  columnCount: number,
  minimumRows: number,
) {
  const targetLength = Math.max(rows.length + TAIL_PADDING_ROWS, minimumRows);
  const blankRow = Array.from({ length: columnCount }, () => "");

  return [
    ...rows,
    ...Array.from({ length: Math.max(0, targetLength - rows.length) }, () => [...blankRow]),
  ];
}

// A block never shrinks by more than a handful of rows in one sync — an elimination is
// cancelled one at a time, a player is deleted one at a time. A whole-sheet reset goes
// through /clearsheet, which clears A2:P itself.
const TAIL_PADDING_ROWS = 50;

export async function appendEliminationRow(data: {
  eliminatedName: string;
  finishPlace: number | null;
  killers: { name: string; share: number }[];
  currentRound: number;
  standingsRows: PtsStandingRow[];
  isMystery?: boolean;
  usesReentry: boolean;
}) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn("Google Sheets not configured");
    return { rowId: 0, sheetName: "" };
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = getTodaySheetName();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  await getOrCreateSheet(sheets, spreadsheetId, sheetName);

  const killerNames = data.killers.map((k) => k.name).join(" / ") || "—";
  const time = new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A:D`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          data.eliminatedName,
          killerNames,
          time,
          data.usesReentry ? "Да" : "",
        ],
      ],
    },
  });

  const updatedRange = res.data.updates?.updatedRange || "";
  const match = updatedRange.match(/!A(\d+):/);
  const rowId = match ? parseInt(match[1]) : 0;

  await updatePtsStandingsRows(sheets, spreadsheetId, sheetName, data.standingsRows, data.isMystery ? "mystery" : "standard");

  return { rowId, sheetName };
}

export async function appendClientBotProfileRow(data: {
  answers: ClientBotProfileAnswers;
  submittedAt?: Date;
  telegramId: number;
  username: string | null;
}) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn("Google Sheets not configured");
    return { sheetName: "анкеты" };
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = "анкеты";
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  await getOrCreateSheet(
    sheets,
    spreadsheetId,
    sheetName,
    CLIENT_BOT_PROFILE_SHEET_HEADERS,
  );

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetName}'!A:${getSheetColumnName(CLIENT_BOT_PROFILE_SHEET_HEADERS.length)}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        buildClientBotProfileSheetRow({
          answers: data.answers,
          submittedAt: data.submittedAt ?? new Date(),
          telegramId: data.telegramId,
          username: data.username,
        }),
      ],
    },
  });

  return { sheetName };
}

const PROFILE_SHEET_NAME = "анкеты";
// 0-based column indexes into the "анкеты" sheet (CLIENT_BOT_PROFILE_SHEET_HEADERS):
// E — Игровой никнейм, G — Дата рождения.
const PROFILE_NICKNAME_COLUMN_INDEX = 4;
const PROFILE_BIRTH_DATE_COLUMN_INDEX = 6;

// Game nicknames of players whose birthday is today (Moscow). Matches day+month only — the
// year is ignored. The stored date is re-normalized to ДД.ММ so a legacy/manual value
// («5.7», «5 июля») still matches. Duplicate questionnaires collapse by nickname (case-
// insensitive). Row 0 is the header and is skipped. Pure: no I/O, so it is unit-testable.
export function pickTodayBirthdayNicknames(grid: string[][], date = new Date()): string[] {
  const { day, month } = getMoscowDateParts(date);
  const today = `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;

  const seen = new Set<string>();
  const nicknames: string[] = [];

  for (let row = 1; row < grid.length; row += 1) {
    const birthDate = String(grid[row]?.[PROFILE_BIRTH_DATE_COLUMN_INDEX] ?? "").trim();
    if (!birthDate) continue;
    if (formatClientBotBirthDateForSheet(birthDate) !== today) continue;

    const nickname = String(grid[row]?.[PROFILE_NICKNAME_COLUMN_INDEX] ?? "").trim();
    if (!nickname) continue;

    const key = nickname.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) continue;
    seen.add(key);
    nicknames.push(nickname);
  }

  return nicknames;
}

// How far ahead the /birthday digest looks by default.
export const UPCOMING_BIRTHDAY_DAYS = 30;

export type UpcomingBirthday = {
  // 0 = today, 1 = tomorrow.
  daysUntil: number;
  // ДД.ММ, the way the digest prints it.
  date: string;
  nickname: string;
};

// Birthdays coming up within `days` days (Moscow), today included, nearest first. The year
// is ignored: a date that already passed this year counts as next year's. A 29.02 birthday
// falls on 01.03 in a non-leap year, which is how JS rolls the date over. Pure: no I/O.
export function pickUpcomingBirthdays(
  grid: string[][],
  options: { date?: Date; days?: number } = {},
): UpcomingBirthday[] {
  const days = Math.max(0, Number(options.days ?? UPCOMING_BIRTHDAY_DAYS));
  const { day, month, year } = getMoscowDateParts(options.date ?? new Date());
  const todayMs = Date.UTC(year, month - 1, day);
  const found: UpcomingBirthday[] = [];

  for (let row = 1; row < grid.length; row += 1) {
    const birthDate = String(grid[row]?.[PROFILE_BIRTH_DATE_COLUMN_INDEX] ?? "").trim();
    if (!birthDate) continue;

    const normalized = formatClientBotBirthDateForSheet(birthDate);
    const parts = normalized.match(/^(\d{2})\.(\d{2})$/);
    if (!parts) continue;

    const nickname = String(grid[row]?.[PROFILE_NICKNAME_COLUMN_INDEX] ?? "").trim();
    if (!nickname) continue;

    const birthDay = Number(parts[1]);
    const birthMonth = Number(parts[2]);
    const thisYearMs = Date.UTC(year, birthMonth - 1, birthDay);
    const nextMs = thisYearMs < todayMs ? Date.UTC(year + 1, birthMonth - 1, birthDay) : thisYearMs;
    const daysUntil = Math.round((nextMs - todayMs) / MS_PER_DAY);
    if (daysUntil > days) continue;

    found.push({ date: normalized, daysUntil, nickname });
  }

  const seen = new Set<string>();

  // Sort first, then de-duplicate: a nickname with two questionnaires keeps the nearest date.
  return found
    .sort((a, b) => a.daysUntil - b.daysUntil || a.nickname.localeCompare(b.nickname, "ru-RU"))
    .filter((birthday) => {
      const key = birthday.nickname.toLocaleLowerCase("ru-RU");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Read the "анкеты" sheet as a string matrix. Returns [] when Sheets is not configured,
// matching the rest of this module's best-effort behavior.
async function readProfileGrid(): Promise<string[][]> {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn("Google Sheets not configured");
    return [];
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `'${PROFILE_SHEET_NAME}'!A1:K`,
  });

  return ((res.data.values ?? []) as unknown[][]).map((row) => row.map((cell) => String(cell ?? "")));
}

export async function getTodayBirthdayNicknames(date = new Date()): Promise<string[]> {
  return pickTodayBirthdayNicknames(await readProfileGrid(), date);
}

// The /birthday digest in the admin bot.
export async function getUpcomingBirthdays(
  options: { date?: Date; days?: number } = {},
): Promise<UpcomingBirthday[]> {
  return pickUpcomingBirthdays(await readProfileGrid(), options);
}

// Counters render as a blank cell (not 0) when the player never did the action.
function blankIfZero(value: number): string | number {
  return Number.isFinite(value) && value > 0 ? value : "";
}

export function buildPlayerOrderRows(players: TournamentPlayer[]): (string | number)[][] {
  return players
    .filter((player) => {
      const value = Number(player.registrationNumber);
      return Number.isInteger(value) && value > 0;
    })
    .sort((a, b) => Number(a.registrationNumber) - Number(b.registrationNumber))
    .map((player) => {
      const doubleRebuys = Math.max(0, Number(player.doubleRebuys) || 0);
      // `rebuys` counts every re-entry including double ones; the sheet reports them
      // separately, so the "Ребаи" column is single re-entries only.
      const singleRebuys = Math.max(0, (Number(player.rebuys) || 0) - doubleRebuys);

      return [
        Number(player.registrationNumber),
        player.name || "",
        blankIfZero(Number(player.addons) || 0),
        blankIfZero(singleRebuys),
        blankIfZero(doubleRebuys),
      ];
    });
}

function buildPlayerOrderBlock(
  sheetName: string,
  players: TournamentPlayer[],
  bountyType: string,
): SheetValueRange {
  // In mystery / dealer modes the standings block is one column wider (F:J), so the order
  // block shifts right to L:P to keep an empty spacer column between the two. Standard mode
  // keeps K:O (standings end at I, J is the spacer).
  const [firstColumn, lastColumn] = isSideBountyPoints(bountyType) ? ["L", "P"] : ["K", "O"];
  const orderRows = padRowsToClearTail(buildPlayerOrderRows(players), 5, 0);

  return {
    range: `'${sheetName}'!${firstColumn}1:${lastColumn}${orderRows.length + 1}`,
    values: [["№", "Игрок", "Аддоны", "Ребаи", "Двойной ребай"], ...orderRows],
  };
}

function buildPtsStandingsBlock(
  sheetName: string,
  rows: PtsStandingRow[],
  bountyType: string,
): SheetValueRange {
  const paddedRows = Array.from({ length: PTS_PLACE_COUNT }, (_, index) => {
    return (
      rows[index] ?? { bountyCount: null, mysteryPoints: null, place: index + 1, playerName: "", points: null }
    );
  });

  // In Mystery / Dealer Revenge modes the fourth column reports each player's side points
  // (mystery prizes / dealer-knockout points — both live in the mysteryPoints field) instead
  // of the knockout count, and PTS (column H) stays place-points-only — the two are never
  // summed. A fifth column (J) then reports the knockout count itself (in bounty shares: a
  // split knockout is 0.5 per killer; knockouts into a re-entry count too), because a real
  // knockout can be worth 0 side points and would otherwise be invisible. Standard bounty
  // mode stays exactly as before: four columns, column J untouched.
  const isWide = isSideBountyPoints(bountyType);
  const headers = isWide
    ? [
      "Место",
      "Игрок",
      "PTS",
      bountyType === "dealer"
        ? "Очки за дилера"
        : bountyType === "wanted"
          ? "Wanted PTS"
          : bountyType === "progressive"
            ? "Очки за баунти"
            : "Mystery-Points",
      "Кол-во выбиваний",
    ]
    : ["Место", "Игрок", "PTS", "Кол-во баунти"];

  return {
    range: `'${sheetName}'!F1:${isWide ? "J" : "I"}${PTS_PLACE_COUNT + 1}`,
    values: [
      headers,
      ...paddedRows.map((row) => [
        row.place,
        row.playerName || "",
        row.points ?? "",
        (isWide ? row.mysteryPoints : row.bountyCount) ?? "",
        ...(isWide ? [row.bountyCount ?? ""] : []),
      ]),
    ],
  };
}

// Kept for appendEliminationRow, the legacy single-row path that writes this block on its
// own rather than as part of a batched full sync.
async function updatePtsStandingsRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  rows: PtsStandingRow[],
  bountyType: string,
) {
  const block = buildPtsStandingsBlock(sheetName, rows, bountyType);

  await withRateLimitRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: block.range,
      valueInputOption: "RAW",
      requestBody: { values: block.values },
    }),
  );
}

// The elimination list (A:D). USER_ENTERED so the "Время вылета" column stays a real time
// value rather than text, which is why this block is batched separately from the RAW ones.
function buildEliminationBlock(
  sheetName: string,
  rows: (string | number)[][],
): SheetValueRange {
  const padded = padRowsToClearTail(rows, 4, 0);

  return {
    range: `'${sheetName}'!A2:D${padded.length + 1}`,
    values: padded,
  };
}


// ---------------------------------------------------------------------------
// Finance sheet: a separate spreadsheet (GOOGLE_FINANCE_SHEET_ID) with one tab per game
// date, listing what every player owes for the evening and the totals per category.
// ---------------------------------------------------------------------------

const FINANCE_SHEET_HEADERS = [
  "№",
  "Игрок",
  "Билет, ₽",
  "Ре-энтри, шт",
  "Ре-энтри, ₽",
  "Двойной, шт",
  "Двойной, ₽",
  "Аддоны, шт",
  "Аддоны, ₽",
  "Итого, ₽",
  "Оплатил",
];

const FINANCE_TOTALS_LABEL = "ИТОГО";

export { getFinancePrices };
export type { FinancePrices };

export function buildFinanceSheetRows(
  players: TournamentPlayer[],
  prices: FinancePrices,
  options: { freeEntry?: boolean } = {},
): (string | number)[][] {
  const freeEntry = Boolean(options.freeEntry);
  const rows = [...players]
    .sort((a, b) => {
      const left = Number(a.registrationNumber) || Number.MAX_SAFE_INTEGER;
      const right = Number(b.registrationNumber) || Number.MAX_SAFE_INTEGER;
      return left - right;
    })
    .map((player) => {
      // The same sum the admin reads off the card at the door — one calculation, so the
      // sheet and the desk can never disagree.
      const charge = buildPlayerCharge(player, prices, { freeroll: freeEntry });
      const registrationNumber = Number(player.registrationNumber);

      return [
        Number.isInteger(registrationNumber) && registrationNumber > 0 ? registrationNumber : "",
        player.name || "",
        charge.ticket.free ? "" : charge.ticket.sum,
        blankIfZero(charge.reentries.count),
        blankIfZero(charge.reentries.sum),
        blankIfZero(charge.doubleReentries.count),
        blankIfZero(charge.doubleReentries.sum),
        blankIfZero(charge.addons.count),
        blankIfZero(charge.addons.sum),
        charge.total,
        // What the admin ticked at the desk, so the sheet and the room agree.
        player.paid ? "Да" : "Нет",
      ];
    });

  if (rows.length === 0) return rows;

  const sumColumn = (index: number) =>
    rows.reduce((total, row) => total + (Number(row[index]) || 0), 0);

  return [
    ...rows,
    [
      "",
      FINANCE_TOTALS_LABEL,
      freeEntry ? "" : sumColumn(2),
      sumColumn(3),
      sumColumn(4),
      sumColumn(5),
      sumColumn(6),
      sumColumn(7),
      sumColumn(8),
      sumColumn(9),
      // How much of the evening is settled, so the total says what is still owed.
      `${rows.filter((row) => row[10] === "Да").length} из ${rows.length}`,
    ],
  ];
}

export function buildFinanceSheetGrid(
  players: TournamentPlayer[],
  prices: FinancePrices,
  options: { freeEntry?: boolean } = {},
): (string | number)[][] {
  return [
    FINANCE_SHEET_HEADERS,
    ...padRowsToClearTail(buildFinanceSheetRows(players, prices, options), FINANCE_SHEET_HEADERS.length, 0),
  ];
}

// Writes the whole finance tab in a single request. Failures here must never break the
// main sync, so the caller swallows them — the money is recomputed from scratch on the
// next sync anyway.
export async function syncFinanceSheet(
  sheetName: string,
  players: TournamentPlayer[],
  settings: TournamentExtras["settings"],
) {
  const spreadsheetId = process.env.GOOGLE_FINANCE_SHEET_ID;
  if (!spreadsheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return null;

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await ensureSheetExists(sheets, spreadsheetId, sheetName);

  const values = buildFinanceSheetGrid(players, getFinancePrices(settings), {
    freeEntry: settings.tournamentFormat === "freeroll",
  });

  await withRateLimitRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetName}'!A1:${getSheetColumnName(FINANCE_SHEET_HEADERS.length)}${values.length}`,
      valueInputOption: "RAW",
      requestBody: { values },
    }),
  );

  return { playerCount: players.length, sheetName };
}

// ---------------------------------------------------------------------------
// "Проходки": the club's ledger of the passes players win — one tab in the finance
// spreadsheet, a line per prize, so the owner can see who won a pass and where.
// ---------------------------------------------------------------------------

const FREE_ENTRY_SHEET_NAME = "Проходки";
const FREE_ENTRY_SHEET_HEADERS = ["Дата", "Игрок", "За что", "Проходка"];

/** The two ways a player wins a pass; passes the owner hands out by name are not events. */
export type FreeEntrySource = "mystery" | "raffle";

const FREE_ENTRY_SOURCE_LABELS: Record<FreeEntrySource, string> = {
  mystery: "Мистери баунти",
  raffle: "Розыгрыш",
};

export type FreeEntryGrant = {
  nickname: string;
  source: FreeEntrySource;
  vip: boolean;
};

export function buildFreeEntryGrantRow(
  grant: FreeEntryGrant,
  date = new Date(),
): (string | number)[] {
  const { day, month, year } = getMoscowDateParts(date);

  return [
    `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`,
    grant.nickname,
    FREE_ENTRY_SOURCE_LABELS[grant.source],
    grant.vip ? "VIP" : "Обычная",
  ];
}

/**
 * Writes one line of the ledger.
 *
 * The pass itself already lives in the player's profile, so a Sheets failure here must
 * never undo a grant: the caller logs and carries on.
 */
export async function appendFreeEntryGrant(grant: FreeEntryGrant, date = new Date()) {
  const spreadsheetId = process.env.GOOGLE_FINANCE_SHEET_ID;
  if (!spreadsheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return null;

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  await getOrCreateSheet(sheets, spreadsheetId, FREE_ENTRY_SHEET_NAME, FREE_ENTRY_SHEET_HEADERS);

  await withRateLimitRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${FREE_ENTRY_SHEET_NAME}'!A:${getSheetColumnName(FREE_ENTRY_SHEET_HEADERS.length)}`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [buildFreeEntryGrantRow(grant, date)] },
    }),
  );

  return { sheetName: FREE_ENTRY_SHEET_NAME };
}

export type TournamentSheetSyncResult = {
  eliminationCount: number;
  sheetName: string;
  standingsCount: number;
};

export async function syncTournamentToSheets(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<TournamentSheetSyncResult | null> {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return null;

  const { data } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const extras = mergeTournamentExtras(data?.data);
  const sessionStartedAt = getEffectiveSessionStart(extras.settings.sheetsSessionStartedAt);
  const fallbackDayRange = getMoscowDayRange();
  const logStartIso = sessionStartedAt ?? fallbackDayRange.startIso;
  let logsQuery = supabase
    .from("bounty_log")
    .select("eliminated_name, killers, players_after, recorded_at, uses_reentry, reentry_double")
    .eq("tournament_id", tournamentId)
    .eq("cancelled", false)
    .gte("recorded_at", logStartIso);

  if (!sessionStartedAt) {
    logsQuery = logsQuery.lt("recorded_at", fallbackDayRange.endIso);
  }

  const { data: logs, error: logsError } = await logsQuery.order("recorded_at", { ascending: true });

  if (logsError) throw logsError;
  const sheetLogs = (logs ?? []) as BountyLogSheetRow[];
  const standingsPlayers = getSheetStandingsPlayers(extras.players, sheetLogs);

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = getEliminationSheetName(sessionStartedAt);
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  await ensureSheetExists(sheets, spreadsheetId, sheetName);

  const bountyType = extras.settings.bountyType;

  // Two writes for the whole sheet, split only by valueInputOption: the headers, the PTS
  // standings and the player order are literal values (RAW), while the elimination rows go
  // through USER_ENTERED so their time column is stored as a time. Everything inside one
  // batch lands or fails together.
  await batchUpdateValues(sheets, spreadsheetId, "RAW", [
    {
      // A:D are the elimination list headers and E is the spacer column, blanked here just
      // as the old full-width header write did. F onwards belongs to the standings block,
      // which writes its own mode-dependent headers below.
      range: `'${sheetName}'!A1:E1`,
      values: [ELIMINATION_SHEET_HEADERS.slice(0, 5)],
    },
    buildPtsStandingsBlock(
      sheetName,
      buildPtsStandingsRows(standingsPlayers, { ...extras.pts, bountyType }),
      bountyType,
    ),
    // Use the same finished-game fallback as the standings: when the tournament ends the
    // roster in extras is wiped, but the final sync must not blank the K/L player-order
    // list — the last log's players_after still holds the full roster with registration
    // numbers.
    buildPlayerOrderBlock(sheetName, standingsPlayers, bountyType),
  ]);

  await batchUpdateValues(sheets, spreadsheetId, "USER_ENTERED", [
    buildEliminationBlock(sheetName, buildEliminationSheetRows(sheetLogs)),
  ]);

  // The money lives in its own spreadsheet, so a problem with it (missing id, no access)
  // must not take the tournament sheet down with it.
  try {
    await syncFinanceSheet(sheetName, standingsPlayers, extras.settings);
  } catch (financeError) {
    console.error("Non-critical finance sheet sync error:", financeError);
  }

  return {
    eliminationCount: sheetLogs.length,
    sheetName,
    standingsCount: standingsPlayers.length,
  };
}

// Read the VIP grid as a string matrix. Guards against a transient empty read: a populated
// VIP sheet always has at least one game-date column, so if the first read returns none we
// re-read once. This means a momentary empty API response can never drive a destructive
// rewrite that drops the recorded game history (the failure seen on 2026-06-07). On a genuine
// first VIP game the re-read is harmless — it just confirms the sheet is still empty.
async function readVipGrid(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
): Promise<string[][]> {
  const readOnce = async () => {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${VIP_SHEET_NAME}'!A1:ZZ`,
    });
    return ((existing.data.values ?? []) as unknown[][]).map((row) =>
      row.map((cell) => String(cell ?? "")),
    );
  };

  let grid = await readOnce();
  if (parseVipGameColumns(grid).length === 0) {
    grid = await readOnce();
  }
  return grid;
}

// Write a VIP grid WITHOUT clearing the sheet first. The additive merge always returns a
// superset of what we read (existing columns keep their position, rows only grow, a new game
// adds a column on the right), so an in-place update leaves no stale cells while never
// blanking the sheet. The header row is written RAW so date labels like "07/06" stay text —
// USER_ENTERED would coerce them into dates that read back differently and spawn a duplicate
// column on the next sync. Body rows use USER_ENTERED so the "Раз в VIP" counts stay numeric.
async function writeVipGridNoClear(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  grid: (string | number)[][],
) {
  if (grid.length === 0) return;

  const [header, ...body] = grid;
  const lastColumn = getSheetColumnName(Math.max(header.length, 1));

  await batchUpdateValues(sheets, spreadsheetId, "RAW", [
    { range: `'${VIP_SHEET_NAME}'!A1:${lastColumn}1`, values: [header] },
  ]);

  if (body.length > 0) {
    await batchUpdateValues(sheets, spreadsheetId, "USER_ENTERED", [
      { range: `'${VIP_SHEET_NAME}'!A2`, values: body },
    ]);
  }
}

async function writeVipSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  gameDate: string,
  players: TournamentPlayer[],
) {
  // No header write of its own: serializeVipGrid already puts VIP_SHEET_HEADERS in row 0 of
  // the grid written below, so a separate one would just spend a request on the same values.
  await ensureSheetExists(sheets, spreadsheetId, VIP_SHEET_NAME);

  const existingGrid = await readVipGrid(sheets, spreadsheetId);
  const grid = buildVipSheetGrid(existingGrid, gameDate, getVipPlayersForGame(players));

  // Additive path: never clear — the new grid is a superset of the existing one.
  await writeVipGridNoClear(sheets, spreadsheetId, grid);
}

// Refresh the VIP tab (the game-date column + the running summary) for the current
// game. Keyed by the game date, so it is safe to call on every registration / sync.
export async function syncVipSheet(supabase: SupabaseClient, tournamentId: string) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return;

  const { data } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const extras = mergeTournamentExtras(data?.data);

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const gameDate = getEliminationSheetName(
    getEffectiveSessionStart(extras.settings.sheetsSessionStartedAt),
  );

  await writeVipSheet(sheets, spreadsheetId, gameDate, extras.players);
}

// Correct an erroneous VIP entry: remove the player from the current game's VIP column and
// decrement their counter. Call when an admin deletes a player who had a VIP registration
// number. Best-effort and idempotent (no-op if the player isn't in that column).
export async function removePlayerFromVipSheet(
  supabase: SupabaseClient,
  tournamentId: string,
  playerName: string,
) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return;

  const name = playerName.trim();
  if (!name) return;

  const { data } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const extras = mergeTournamentExtras(data?.data);

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const gameDate = getEliminationSheetName(
    getEffectiveSessionStart(extras.settings.sheetsSessionStartedAt),
  );

  // No header write of its own: serializeVipGrid already puts VIP_SHEET_HEADERS in row 0 of
  // the grid written below, so a separate one would just spend a request on the same values.
  await ensureSheetExists(sheets, spreadsheetId, VIP_SHEET_NAME);

  const existingGrid = await readVipGrid(sheets, spreadsheetId);
  const grid = removeFromVipSheetGrid(existingGrid, gameDate, name);

  // Removal can shrink the grid (a name leaves a column, an emptied column drops), so unlike
  // the additive path this one clears first to wipe any now-orphaned trailing cells, then
  // rewrites the smaller grid in place.
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${VIP_SHEET_NAME}'!A1:ZZ`,
  });
  await writeVipGridNoClear(sheets, spreadsheetId, grid);
}

export async function clearTournamentSheet(spreadsheetId: string, sheetName: string) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn("Google Sheets not configured");
    return;
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetName}'!A2:P`,
  });
}

export async function markRowCancelled(sheetName: string, rowIndex: number) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return;
  if (rowIndex <= 0) return;

  void sheetName;
}
