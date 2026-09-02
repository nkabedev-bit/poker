import { google } from "googleapis";
import {
  isMonthSheetName,
  parseGameSheetDate,
  parseGameStandings,
  findMonthSheetHeaders,
  parseMonthStandings,
  parseSheetPeriod,
  type ParsedGameRow,
  type ParsedMonthRow,
} from "@/lib/sheets-import/parse-sheets";

export const GAMES_SPREADSHEET_ID = "1vi6dYW-1pWK88awEPCApOvz5K7GZRQoeVM1ONiiVGvY";
export const RATING_SPREADSHEET_ID = "1wn7Ye7TANry4cttHql-BkhTXnQyRNdcisFoj511urac";

export type ImportedGame = {
  playedOn: string;
  rows: ParsedGameRow[];
  sheetName: string;
};

export type ImportedMonth = {
  coveredMonths: string[];
  headers: string[];
  pointsHeading: string | null;
  label: string;
  month: string;
  rows: ParsedMonthRow[];
  sheetName: string;
};

export type SkippedSheet = { reason: string; sheetName: string };

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ auth, version: "v4" });
}

async function listSheetNames(spreadsheetId: string) {
  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });

  return (meta.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter((title) => title.length > 0);
}

/**
 * Reads several ranges in one call. The club has years of game sheets, and asking for
 * them one at a time would burn the per-minute quota long before finishing.
 */
async function batchGet(spreadsheetId: string, ranges: string[]) {
  if (ranges.length === 0) return [];

  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.batchGet({ ranges, spreadsheetId });

  return (response.data.valueRanges ?? []).map((range) => (range.values ?? []) as unknown[][]);
}

/** Every game sheet in the club's game spreadsheet, with its standings block. */
export async function readGames(year: number): Promise<ImportedGame[]> {
  const names = await listSheetNames(GAMES_SPREADSHEET_ID);
  const games = names
    .map((sheetName) => ({ playedOn: parseGameSheetDate(sheetName, year), sheetName }))
    .filter((game): game is { playedOn: string; sheetName: string } => game.playedOn !== null);

  const values = await batchGet(
    GAMES_SPREADSHEET_ID,
    games.map((game) => `'${game.sheetName}'!F1:J31`),
  );

  return games
    .map((game, index) => ({ ...game, rows: parseGameStandings(values[index] ?? []) }))
    .filter((game) => game.rows.length > 0);
}

/** The month sheets of the club's rating spreadsheet, skipping the reference tabs. */
export async function readMonths(
  fallbackYear: number,
  pointsHeadings: Record<string, string> = {},
): Promise<{ months: ImportedMonth[]; skipped: SkippedSheet[] }> {
  const names = await listSheetNames(RATING_SPREADSHEET_ID);
  const skipped: SkippedSheet[] = [];
  const candidates: Array<{
    coveredMonths: string[];
    label: string;
    month: string;
    sheetName: string;
  }> = [];

  for (const sheetName of names) {
    if (!isMonthSheetName(sheetName)) {
      skipped.push({ reason: "не похоже на месяц", sheetName });
      continue;
    }

    const period = parseSheetPeriod(sheetName, fallbackYear);
    if (!period) {
      skipped.push({ reason: "не удалось определить период", sheetName });
      continue;
    }

    candidates.push({
      coveredMonths: period.coveredMonths,
      label: period.label,
      month: period.key,
      sheetName,
    });
  }

  const values = await batchGet(
    RATING_SPREADSHEET_ID,
    candidates.map((month) => `'${month.sheetName}'!A1:Z200`),
  );

  const months: ImportedMonth[] = [];
  candidates.forEach((candidate, index) => {
    const sheetValues = values[index] ?? [];
    const pointsHeading = pointsHeadings[candidate.sheetName] ?? null;
    const rows = parseMonthStandings(sheetValues, pointsHeading ?? undefined);

    if (rows.length === 0) {
      const header = (sheetValues[0] ?? []).map((cell) => String(cell ?? "")).filter(Boolean);
      skipped.push({
        reason: header.length > 0
          ? `не нашли колонки: ${header.slice(0, 6).join(" | ")}`
          : "лист пустой",
        sheetName: candidate.sheetName,
      });
      return;
    }

    months.push({
      ...candidate,
      headers: findMonthSheetHeaders(sheetValues),
      pointsHeading,
      rows,
    });
  });

  return { months, skipped };
}
