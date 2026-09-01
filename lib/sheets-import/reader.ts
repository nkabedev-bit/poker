import { google } from "googleapis";
import {
  isMonthSheetName,
  parseGameSheetDate,
  parseGameStandings,
  parseMonthSheetKey,
  parseMonthStandings,
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
  month: string;
  rows: ParsedMonthRow[];
  sheetName: string;
};

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
export async function readMonths(fallbackYear: number): Promise<ImportedMonth[]> {
  const names = await listSheetNames(RATING_SPREADSHEET_ID);
  const months = names
    .filter((sheetName) => isMonthSheetName(sheetName))
    .map((sheetName) => ({ month: parseMonthSheetKey(sheetName, fallbackYear), sheetName }))
    .filter((month): month is { month: string; sheetName: string } => month.month !== null);

  const values = await batchGet(
    RATING_SPREADSHEET_ID,
    months.map((month) => `'${month.sheetName}'!A1:Z200`),
  );

  return months
    .map((month, index) => ({ ...month, rows: parseMonthStandings(values[index] ?? []) }))
    .filter((month) => month.rows.length > 0);
}
