# Google Sheets Sync Optimization and Decoupling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Optimize Google Sheets sync by reducing redundant header update calls, and isolate sheets operations into non-blocking asynchronous/safe execution to prevent errors/timeouts from affecting main tournament actions.

**Architecture:** We will (1) remove redundant header updates from the sheet creation flow, (2) wrap Next.js TMA elimination sheets API calls in `after()` callbacks with isolated try/catch blocks for non-blocking execution, and (3) isolate other Google Sheets sync entry points in try/catch blocks.

**Tech Stack:** Next.js (App Router), Google Sheets API, Supabase

---

### Task 1: Optimize headers writing in Google Sheets helper

**Files:**
- Modify: `lib/google-sheets.ts`

**Step 1: Modify `lib/google-sheets.ts`**
Remove the final `await updateSheetHeaders(...)` from `getOrCreateSheet` so headers are updated ONLY when a sheet is newly created.

---

### Task 2: Implement non-blocking async execution in elimination route handler

**Files:**
- Modify: `app/api/tma/eliminations/route.ts`
- Modify: `tests/tma/eliminations-route.test.ts`

**Step 1: Implement `after` wrapper**
Wrap the `appendEliminationRow` and `updateBountyLogSheetsRow` calls in Next.js `after()` inside `POST` handler in `app/api/tma/eliminations/route.ts`, isolated within a `try/catch` block. Update the return value to omit `sheetsRowId` and `sheetName`.

**Step 2: Add mock for `after` in tests**
Mock `next/server`'s `after` in `tests/tma/eliminations-route.test.ts` to run callbacks synchronously so tests can run assertively.

---

### Task 3: Enhance robustness of cancellation endpoint and player restore PATCH endpoint

**Files:**
- Modify: `app/api/tma/eliminations/[id]/cancel/route.ts`
- Modify: `app/api/tma/players/[id]/route.ts`

**Step 1: Update cancel endpoint**
Improve `app/api/tma/eliminations/[id]/cancel/route.ts` to use sheets information from database `typedLog` or fall back to request body and todays sheet name, wrapped in a try/catch block.

**Step 2: Update player restore PATCH endpoint**
Wrap the delete row and update standings Google Sheets calls in a try/catch block in `app/api/tma/players/[id]/route.ts`.

---

### Task 4: Wrap client bot registration webhook sheet sync in try/catch

**Files:**
- Modify: `app/api/client-bot/webhook/route.ts`

**Step 1: Wrap in try/catch**
Wrap `appendClientBotProfileRow` inside `app/api/client-bot/webhook/route.ts` in a try/catch block.
