import { google, type sheets_v4 } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildClientBotProfileSheetRow,
  CLIENT_BOT_PROFILE_SHEET_HEADERS,
  type ClientBotProfileAnswers,
} from "@/lib/client-bot/registration";
import { buildPtsStandingsRows, type PtsStandingRow } from "@/lib/pts-rating";
import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";
import type { TournamentPlayer } from "@/lib/timer/types";

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

// Names of players who registered as VIP (registration number 19-27 / table 3),
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

async function getOrCreateSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  headers = ELIMINATION_SHEET_HEADERS,
) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some(
    (s: sheets_v4.Schema$Sheet) => s.properties?.title === sheetName
  );

  if (!exists) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: { properties: { title: sheetName } },
            },
          ],
        },
      });

      await updateSheetHeaders(sheets, spreadsheetId, sheetName, headers);
    } catch {
      console.log("Sheet creation race condition handled");
    }
  }

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

export async function appendEliminationRow(data: {
  eliminatedName: string;
  finishPlace: number | null;
  killers: { name: string; share: number }[];
  currentRound: number;
  standingsRows: PtsStandingRow[];
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

  await updatePtsStandingsRows(sheets, spreadsheetId, sheetName, data.standingsRows);

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

async function updatePtsStandingsRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  rows: PtsStandingRow[],
) {
  const paddedRows = Array.from({ length: 28 }, (_, index) => {
    return rows[index] ?? { bountyCount: null, place: index + 1, playerName: "", points: null };
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!F1:I29`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["Место", "Игрок", "PTS", "Кол-во баунти"],
        ...paddedRows.map((row) => [
          row.place,
          row.playerName || "",
          row.points ?? "",
          row.bountyCount ?? "",
        ]),
      ],
    },
  });
}

async function updateEliminationRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
  rows: unknown[][],
) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheetName}'!A2:D`,
  });

  if (rows.length === 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A2:D${rows.length + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rows,
    },
  });
}

export async function syncTournamentToSheets(supabase: SupabaseClient, tournamentId: string) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return;

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

  await getOrCreateSheet(sheets, spreadsheetId, sheetName);
  await updateEliminationRows(
    sheets,
    spreadsheetId,
    sheetName,
    buildEliminationSheetRows(sheetLogs),
  );
  await updatePtsStandingsRows(
    sheets,
    spreadsheetId,
    sheetName,
    buildPtsStandingsRows(standingsPlayers, { ...extras.pts, bountyType: extras.settings.bountyType }),
  );
  await writeVipSheet(sheets, spreadsheetId, sheetName, extras.players);
}

// Read the VIP grid, apply a pure transform, and write the result back.
async function mutateVipSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  transform: (existingGrid: string[][]) => (string | number)[][],
) {
  await getOrCreateSheet(sheets, spreadsheetId, VIP_SHEET_NAME, VIP_SHEET_HEADERS);

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${VIP_SHEET_NAME}'!A1:ZZ`,
  });
  const existingGrid = ((existing.data.values ?? []) as unknown[][]).map((row) =>
    row.map((cell) => String(cell ?? "")),
  );

  const grid = transform(existingGrid);

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${VIP_SHEET_NAME}'!A1:ZZ`,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${VIP_SHEET_NAME}'!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: grid },
  });
}

async function writeVipSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  gameDate: string,
  players: TournamentPlayer[],
) {
  await mutateVipSheet(sheets, spreadsheetId, (existingGrid) =>
    buildVipSheetGrid(existingGrid, gameDate, getVipPlayersForGame(players)),
  );
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

  await mutateVipSheet(sheets, spreadsheetId, (existingGrid) =>
    removeFromVipSheetGrid(existingGrid, gameDate, name),
  );
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
    range: `'${sheetName}'!A2:J`,
  });
}

export async function markRowCancelled(sheetName: string, rowIndex: number) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return;
  if (rowIndex <= 0) return;

  void sheetName;
}
