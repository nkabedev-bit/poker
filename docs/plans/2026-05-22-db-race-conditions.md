# Database Race Conditions (DB Concurrency Fix) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve race conditions and write conflicts on `tournament_extras.data` by using atomic PostgreSQL RPC functions with row-locking (`SELECT ... FOR UPDATE`) for player mutations instead of non-atomic Read-Modify-Write in Node.js.

**Architecture:** Create six new PostgreSQL functions in Supabase to handle registration/actions atomically within transactions: `update_tournament_player`, `delete_tournament_player`, `add_tournament_player_addon`, `move_tournament_player`, `record_player_elimination`, and `cancel_player_elimination`. Update the Next.js Route Handlers to call these RPCs instead of performing non-atomic operations in JS.

**Tech Stack:** Next.js (App Router), Supabase (PostgreSQL), TypeScript.

---

## Proposed Changes

### Database Migrations

#### [NEW] [202605220003_db_race_conditions_fix.sql](file:///Users/nikitakabedev/Desktop/poker/supabase/migrations/202605220003_db_race_conditions_fix.sql)
Create a migration file containing SQL functions with row locking:
- `update_tournament_player`
- `delete_tournament_player`
- `add_tournament_player_addon`
- `move_tournament_player`
- `record_player_elimination`
- `cancel_player_elimination`

Each function selects the row `FOR UPDATE` to lock it, performs the JSONB manipulation on the `players` array, updates the database, and returns the modified player/result.

---

### TMA API Route Handlers

#### [MODIFY] [players [id] route.ts](file:///Users/nikitakabedev/Desktop/poker/app/api/tma/players/[id]/route.ts)
- Modify `DELETE` to use `delete_tournament_player` RPC.
- Modify `PATCH` (action = `restore_player`) to use `cancel_player_elimination` RPC.
- Modify `PATCH` (action = `move_table`) to use `move_tournament_player` RPC.
- Modify `PATCH` (action = `add_addon`) to use `add_tournament_player_addon` RPC.

#### [MODIFY] [eliminations route.ts](file:///Users/nikitakabedev/Desktop/poker/app/api/tma/eliminations/route.ts)
- Modify `POST` to use `record_player_elimination` RPC.
- Clean up redundant JS-level calculations (e.g. `recordPtsElimination`).

#### [MODIFY] [cancel route.ts](file:///Users/nikitakabedev/Desktop/poker/app/api/tma/eliminations/[id]/cancel/route.ts)
- Modify `POST` to use `cancel_player_elimination` RPC.

---

### Unit & Integration Tests

#### [MODIFY] [players-route.test.ts](file:///Users/nikitakabedev/Desktop/poker/tests/tma/players-route.test.ts)
- Update mock supabase and expectations to match the new RPC invocations.

#### [MODIFY] [eliminations-route.test.ts](file:///Users/nikitakabedev/Desktop/poker/tests/tma/eliminations-route.test.ts)
- Update mock supabase and expectations to match the new RPC invocation for elimination.

#### [MODIFY] [eliminations-cancel-route.test.ts](file:///Users/nikitakabedev/Desktop/poker/tests/tma/eliminations-cancel-route.test.ts)
- Update mock supabase and expectations to match the new RPC invocation for cancellation.

---

## Verification Plan

### Automated Tests
Run Vitest test suite:
`npm test`

Verify that all existing tests and updated route handler tests pass successfully.
