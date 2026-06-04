# Robust Google Sheets Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace incremental Google Sheets API appends/deletes with a robust database-driven sync that overwrites the entire sheet on every update, ensuring eventual consistency and preventing race conditions or row-shifting bugs.

**Architecture:** Use Supabase database (`bounty_log` and `tournament_extras`) as the absolute source of truth. After any change (elimination, re-entry, or cancellation), fetch the full timeline and standings from Supabase, compile a unified matrix of all rows, and overwrite the spreadsheet range in one batch request asynchronously using Next.js `after()`.

**Tech Stack:** Next.js 15, Supabase, Google Sheets API (Googleapis npm package).

---

### Task 1: Implement `syncTournamentToSheets` in `lib/google-sheets.ts`

**Files:**
- Modify: `lib/google-sheets.ts`
- Test: `tests/lib/google-sheets.test.ts` (if exists, or mock-validate)

**Step 1: Write `syncTournamentToSheets` function**

Replace the existing implementation with the unified batch sync function. We will retrieve:
1. Tournament details and settings from `tournaments` and `tournament_extras`.
2. All `bounty_log` records sorted by `recorded_at ASC`.
3. Standings rows from `buildPtsStandingsRows`.

```typescript
export async function syncTournamentToSheets(supabase: any, tournamentId: string) {
  if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn("Google Sheets not configured");
    return;
  }

  // 1. Fetch tournament settings and players
  const { data: extrasData, error: extrasError } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournamentId)
    .single();

  if (extrasError || !extrasData) {
    throw new Error(`Failed to load tournament extras: ${extrasError?.message}`);
  }

  const extras = extrasData.data || {};
  const players = Array.isArray(extras.players) ? extras.players : [];

  // 2. Fetch all active (non-cancelled) bounty logs
  const { data: logs, error: logsError } = await supabase
    .from("bounty_log")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("recorded_at", { ascending: true });

  if (logsError) {
    throw new Error(`Failed to load bounty logs: ${logsError.message}`);
  }

  // 3. Format standings
  const standings = buildPtsStandingsRows(players, {
    bountyPoints: extras.pts?.bountyPoints,
    placePoints: extras.pts?.placePoints,
    bountyType: extras.settings?.bountyType,
  });

  // 4. Authenticate Google Sheets
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetName = getTodaySheetName();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  await getOrCreateSheet(sheets, spreadsheetId, sheetName);

  // 5. Construct the matrix (columns A to J)
  const rowCount = Math.max(logs.length, standings.length, 100);
  const rows: any[][] = [];

  for (let i = 0; i < rowCount; i++) {
    const log = logs[i];
    const standing = standings[i];

    const colA = log ? log.eliminated_name || "—" : "";
    const colB = log
      ? Array.isArray(log.killers)
        ? log.killers.map((k: any) => k.name).join(" / ")
        : "—"
      : "";
    const colC = log
      ? new Date(log.recorded_at).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Moscow",
        })
      : "";
    const colD = log ? (log.uses_reentry ? "Да" : "") : "";

    const colE = "";

    const colF = standing ? standing.place : "";
    const colG = standing ? standing.playerName : "";
    const colH = standing ? (standing.points !== null ? standing.points : "") : "";
    const colI = standing ? (standing.bountyCount !== null ? standing.bountyCount : "") : "";
    const colJ = standing ? (standing.mysteryBountyPoints !== null ? standing.mysteryBountyPoints : "") : "";

    rows.push([colA, colB, colC, colD, colE, colF, colG, colH, colI, colJ]);
  }

  // Write range A2:J(rowCount+1)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A2:J${rowCount + 1}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rows,
    },
  });
}
```

Delete the obsolete functions:
- `appendEliminationRow`
- `deleteEliminationRow`
- `updatePtsStandingsRows`
- `updateEliminationStandingsRows`

**Step 2: Save and verify the changes syntax**

---

### Task 2: Refactor API endpoints to use unified `syncTournamentToSheets`

**Files:**
- Modify: `app/api/tma/eliminations/route.ts`
- Modify: `app/api/tma/players/[id]/route.ts`
- Modify: `app/api/tma/eliminations/[id]/cancel/route.ts`

**Step 1: Update `app/api/tma/eliminations/route.ts`**
Replace the background `after()` execution block:
```typescript
    // Sync to Sheets asynchronously in the background
    after(async () => {
      try {
        await syncTournamentToSheets(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical Google Sheets sync error:", sheetError);
      }
    });
```
Remove `updateBountyLogSheetsRow` function and imports of deleted sheet helpers.

**Step 2: Update `app/api/tma/players/[id]/route.ts`**
Import `syncTournamentToSheets`. Replace the blocking sheets sync in `restore_player` (lines 117-128) with `after()` block:
```typescript
    after(async () => {
      try {
        await syncTournamentToSheets(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical player restore sheets sync error:", sheetError);
      }
    });
```

**Step 3: Update `app/api/tma/eliminations/[id]/cancel/route.ts`**
Import `syncTournamentToSheets`. Replace blocking sheets sync in `POST` (lines 81-100) with `after()` block:
```typescript
    after(async () => {
      try {
        await syncTournamentToSheets(auth.supabase, t.id);
      } catch (sheetError) {
        console.error("Non-critical cancel sheets sync error:", sheetError);
      }
    });
```

---

### Task 3: Verification

1. Run standard project tests to verify code builds and endpoints execute properly.
2. Manually test or inspect the generated row mapping matrix logic to ensure correct alignment with Google Sheets columns.
