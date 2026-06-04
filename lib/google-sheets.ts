import { google, type sheets_v4 } from "googleapis";
import type { PtsStandingRow } from "@/lib/pts-rating";

function getTodaySheetName() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
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

      await updateSheetHeaders(sheets, spreadsheetId, sheetName);
    } catch {
      // Игнорируем ошибку, если лист уже был создан параллельно
      console.log("Sheet creation race condition handled");
    }
  }

  await updateSheetHeaders(sheets, spreadsheetId, sheetName);
}

async function updateSheetHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string,
) {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A1:I1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["Вылетел", "Кто получает баунти", "Время вылета", "Ре-энтри", "", "Место", "Игрок", "PTS", "Кол-во баунти"],
      ],
    },
  });
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
    return { rowId: 0, sheetName: "" }; // Mock for local
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = getTodaySheetName();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  await getOrCreateSheet(sheets, spreadsheetId, sheetName);

  const killerNames = data.killers.map((k) => k.name).join(" / ") || "—";
  
  // local time in moscow/etc? we use toLocaleTimeString with ru-RU
  const time = new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow", // Force timezone for consistency if needed, or omit
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

  // Example match: "'04/05'!A12:G12"
  const updatedRange = res.data.updates?.updatedRange || "";
  const match = updatedRange.match(/!A(\d+):/);
  const rowId = match ? parseInt(match[1]) : 0;

  await updatePtsStandingsRows(sheets, spreadsheetId, sheetName, data.standingsRows);

  return { rowId, sheetName };
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

export async function markRowCancelled(sheetName: string, rowIndex: number) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return;
  
  if (rowIndex <= 0) return;
}
