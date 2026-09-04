import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TournamentPlayer } from "@/lib/timer/types";

type SheetsCall = { method: string; range?: string; ranges?: string[] };

const calls: SheetsCall[] = [];
let batchUpdateFailures = 0;

function quotaError() {
  const error = new Error(
    "Quota exceeded for quota metric 'Write requests' and limit "
    + "'Write requests per minute per user' of service 'sheets.googleapis.com'",
  ) as Error & { code: number };
  error.code = 429;
  return error;
}

const valuesApi = {
  append: vi.fn(async (params: { range: string }) => {
    calls.push({ method: "values.append", range: params.range });
    return { data: { updates: { updatedRange: `'${SHEET}'!A2:D2` } } };
  }),
  batchClear: vi.fn(async (params: { requestBody: { ranges: string[] } }) => {
    calls.push({ method: "values.batchClear", ranges: params.requestBody.ranges });
    return { data: {} };
  }),
  batchUpdate: vi.fn(async (params: {
    requestBody: { data: { range: string; values: unknown[][] }[]; valueInputOption: string };
  }) => {
    if (batchUpdateFailures > 0) {
      batchUpdateFailures -= 1;
      throw quotaError();
    }
    calls.push({
      method: `values.batchUpdate:${params.requestBody.valueInputOption}`,
      ranges: params.requestBody.data.map((entry) => entry.range),
    });
    return { data: {} };
  }),
  clear: vi.fn(async (params: { range: string }) => {
    calls.push({ method: "values.clear", range: params.range });
    return { data: {} };
  }),
  get: vi.fn(async (params: { range: string }) => {
    calls.push({ method: "values.get", range: params.range });
    return { data: { values: [] } };
  }),
  update: vi.fn(async (params: { range: string }) => {
    calls.push({ method: "values.update", range: params.range });
    return { data: {} };
  }),
};

const spreadsheetsApi = {
  batchUpdate: vi.fn(async () => {
    calls.push({ method: "spreadsheets.batchUpdate" });
    return { data: {} };
  }),
  get: vi.fn(async () => {
    calls.push({ method: "spreadsheets.get" });
    return { data: { sheets: [{ properties: { title: SHEET } }, { properties: { title: "VIP" } }] } };
  }),
  values: valuesApi,
};

vi.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: class { } },
    sheets: () => ({ spreadsheets: spreadsheetsApi }),
  },
}));

const {
  appendFreeEntryGrant,
  buildFreeEntryGrantRow,
  getEliminationSheetName,
  syncTournamentToSheets,
  syncVipSheet,
} = await import("@/lib/google-sheets");

// The sync names the tab after the game date, so the expectations follow the clock instead
// of a hardcoded label that would rot tomorrow.
const SHEET = getEliminationSheetName();

// Every write request the sync issues. A read (spreadsheets.get / values.get) does not count
// against the write quota that caused the 2026-08-30 incident.
const WRITE_METHODS = [
  "values.append",
  "values.batchClear",
  "values.batchUpdate:RAW",
  "values.batchUpdate:USER_ENTERED",
  "values.clear",
  "values.update",
  "spreadsheets.batchUpdate",
];

function writeCalls() {
  return calls.filter((call) => WRITE_METHODS.includes(call.method));
}

function player(registrationNumber: number, overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    id: `p${registrationNumber}`,
    name: `Игрок ${registrationNumber}`,
    status: "active",
    registrationNumber,
    ...overrides,
  } as TournamentPlayer;
}

function eliminationLog(name: string, recordedAt: string, playersAfter: TournamentPlayer[]) {
  return {
    eliminated_name: name,
    killers: [{ name: "Киллер", share: 1 }],
    players_after: playersAfter,
    recorded_at: recordedAt,
    reentry_double: false,
    uses_reentry: false,
  };
}

function fakeSupabase(extras: unknown, logs: unknown[]): SupabaseClient {
  const logsQuery = {
    eq: () => logsQuery,
    gte: () => logsQuery,
    lt: () => logsQuery,
    order: async () => ({ data: logs, error: null }),
    select: () => logsQuery,
  };

  return {
    from: (table: string) => {
      if (table === "bounty_log") return logsQuery;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { data: extras }, error: null }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

const roster = Array.from({ length: 27 }, (_, index) => player(index + 1));

function extrasWith(players: TournamentPlayer[], bountyType = "standard") {
  return {
    players,
    settings: { bountyType, sheetsSessionStartedAt: new Date().toISOString() },
  };
}

beforeEach(() => {
  calls.length = 0;
  batchUpdateFailures = 0;
  vi.clearAllMocks();
  process.env.GOOGLE_SHEET_ID = "sheet-id";
  delete process.env.GOOGLE_FINANCE_SHEET_ID;
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: "a@b.c", private_key: "k" });
});

describe("syncTournamentToSheets write budget", () => {
  it("regression: a full sync costs 2 write requests (2026-08-30 quota incident)", async () => {
    const logs = Array.from({ length: 8 }, (_, index) =>
      eliminationLog(`Игрок ${index + 1}`, `2026-08-30T19:1${index}:00.000Z`, roster));

    await syncTournamentToSheets(fakeSupabase(extrasWith(roster, "standard"), logs), "t1");

    // 9 writes per sync × 8 knockouts in a minute blew the 60/min quota. At 2 writes the
    // same burst costs 16, and even 25 knockouts in a minute stay under the limit.
    expect(writeCalls()).toHaveLength(2);
  });

  it("issues no clear requests, so a failed write can never leave the sheet blanked", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1");

    expect(calls.filter((call) => call.method === "values.clear")).toHaveLength(0);
    expect(calls.filter((call) => call.method === "values.batchClear")).toHaveLength(0);
  });

  it("does not touch the VIP tab — a knockout cannot change who is VIP", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1");

    const touchedVip = calls.some((call) =>
      (call.range ?? "").includes("VIP")
      || (call.ranges ?? []).some((range) => range.includes("VIP")));
    expect(touchedVip).toBe(false);
  });

  it("writes no request at all to create a sheet that already exists", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1");

    expect(calls.filter((call) => call.method === "spreadsheets.batchUpdate")).toHaveLength(0);
  });
});

describe("finance sheet sync", () => {
  it("costs one extra write and fills the money block when the finance sheet is configured", async () => {
    process.env.GOOGLE_FINANCE_SHEET_ID = "finance-id";

    await syncTournamentToSheets(
      fakeSupabase(extrasWith([player(1, { addons: 1, rebuys: 2 } as Partial<TournamentPlayer>)]), []),
      "t1",
    );

    expect(writeCalls()).toHaveLength(3);
    const financeWrite = calls.find((call) => call.method === "values.update");
    expect(financeWrite?.range).toStrictEqual(expect.stringContaining(`'${SHEET}'!A1:K`));
  });

  it("stays out of the way when the finance spreadsheet is not configured", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1");

    expect(writeCalls()).toHaveLength(2);
    expect(calls.some((call) => call.method === "values.update")).toBe(false);
  });
});

describe("syncTournamentToSheets block layout", () => {
  it("puts headers, standings and player order in the RAW batch", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster, "standard"), []), "t1");

    const raw = calls.find((call) => call.method === "values.batchUpdate:RAW");
    expect(raw?.ranges?.[0]).toBe(`'${SHEET}'!A1:E1`);
    expect(raw?.ranges?.[1]).toBe(`'${SHEET}'!F1:I31`);
    expect(raw?.ranges?.[2]).toStrictEqual(expect.stringContaining(`'${SHEET}'!K1:O`));
  });

  it("shifts the player order block to L:P in side-bounty modes", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster, "mystery"), []), "t1");

    const raw = calls.find((call) => call.method === "values.batchUpdate:RAW");
    expect(raw?.ranges?.[1]).toBe(`'${SHEET}'!F1:J31`);
    expect(raw?.ranges?.[2]).toStrictEqual(expect.stringContaining(`'${SHEET}'!L1:P`));
  });

  it("uses the wide standings layout in Progressive Bounty too", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster, "progressive"), []), "t1");

    const raw = calls.find((call) => call.method === "values.batchUpdate:RAW");
    expect(raw?.ranges?.[1]).toBe(`'${SHEET}'!F1:J31`);
    expect(raw?.ranges?.[2]).toStrictEqual(expect.stringContaining(`'${SHEET}'!L1:P`));
  });

  it("writes eliminations in their own USER_ENTERED batch so times stay times", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1");

    const entered = calls.find((call) => call.method === "values.batchUpdate:USER_ENTERED");
    expect(entered?.ranges).toHaveLength(1);
    expect(entered?.ranges?.[0]).toStrictEqual(expect.stringContaining(`'${SHEET}'!A2:D`));
  });
});

describe("syncTournamentToSheets tail padding", () => {
  it("pads the elimination block so a shrinking list overwrites its own stale tail", async () => {
    const logs = [eliminationLog("Игрок 1", "2026-08-30T19:10:00.000Z", roster)];
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster, "standard"), logs), "t1");

    const payload = valuesApi.batchUpdate.mock.calls
      .map(([params]) => params.requestBody)
      .find((body) => body.valueInputOption === "USER_ENTERED");
    const rows = payload?.data[0].values ?? [];

    // One real row plus the blank tail: a cancelled elimination shrinks the list by one and
    // the blanks overwrite what used to sit there.
    expect(rows.length).toBeGreaterThan(logs.length);
    expect(rows.every((row) => row.length === 4)).toBe(true);
    expect(rows.at(-1)).toEqual(["", "", "", ""]);
  });

  it("pads the player order block the same way", async () => {
    await syncTournamentToSheets(fakeSupabase(extrasWith(roster.slice(0, 3)), []), "t1");

    const payload = valuesApi.batchUpdate.mock.calls
      .map(([params]) => params.requestBody)
      .find((body) => body.valueInputOption === "RAW");
    const orderRows = payload?.data[2].values ?? [];

    expect(orderRows[0]).toEqual(["№", "Игрок", "Аддоны", "Ребаи", "Двойной ребай"]);
    expect(orderRows.length).toBeGreaterThan(4);
    expect(orderRows.at(-1)).toEqual(["", "", "", "", ""]);
  });
});

describe("syncTournamentToSheets resilience and result", () => {
  it("retries a rate-limited write instead of dying and leaving the sheet stale", async () => {
    batchUpdateFailures = 1;

    await expect(syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1")).resolves.toBeTruthy();
    expect(writeCalls()).toHaveLength(2);
  });

  it("rethrows a non-quota error rather than retrying it", async () => {
    valuesApi.batchUpdate.mockRejectedValueOnce(new Error("Requested entity was not found"));

    await expect(syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1"))
      .rejects.toThrow("Requested entity was not found");
  });

  it("reports the sheet name and the counts it wrote", async () => {
    const logs = Array.from({ length: 56 }, (_, index) =>
      eliminationLog(`Игрок ${index + 1}`, `2026-08-30T19:00:00.000Z`, roster));

    const result = await syncTournamentToSheets(fakeSupabase(extrasWith(roster, "standard"), logs), "t1");

    expect(result).toEqual({ eliminationCount: 56, sheetName: SHEET, standingsCount: 27 });
  });

  it("returns null when Sheets is not configured", async () => {
    delete process.env.GOOGLE_SHEET_ID;

    await expect(syncTournamentToSheets(fakeSupabase(extrasWith(roster), []), "t1")).resolves.toBeNull();
    expect(writeCalls()).toHaveLength(0);
  });
});

describe("syncVipSheet write budget", () => {
  it("regression: a VIP sync costs 2 write requests, so a registration rush stays under quota", async () => {
    await syncVipSheet(fakeSupabase(extrasWith(roster), []), "t1");

    // 27 players registering back to back used to cost 81 writes a minute against the same
    // 60/min limit that broke the elimination sync.
    expect(writeCalls()).toHaveLength(2);
  });

  it("writes the VIP headers as part of the grid rather than as a request of its own", async () => {
    await syncVipSheet(fakeSupabase(extrasWith(roster), []), "t1");

    const header = valuesApi.batchUpdate.mock.calls
      .map(([params]) => params.requestBody)
      .find((body) => body.valueInputOption === "RAW")?.data[0];

    expect(header?.range).toContain("VIP");
    expect(header?.values[0].slice(0, 2)).toEqual(["Игрок", "Раз в VIP"]);
  });
});

describe("free entry ledger", () => {
  it("writes the date, the player, the prize and the kind of pass", () => {
    const row = buildFreeEntryGrantRow(
      { count: 1, nickname: "Старый узбек", source: "mystery", vip: true },
      new Date("2026-09-04T18:00:00.000Z"),
    );

    expect(row).toEqual(["04.09.2026", "Старый узбек", "Мистери баунти", "VIP", 1]);
  });

  it("names the raffle as the reason for a pass won on the wheel", () => {
    const row = buildFreeEntryGrantRow(
      { count: 1, nickname: "Ace", source: "raffle", vip: false },
      new Date("2026-09-04T18:00:00.000Z"),
    );

    expect(row.slice(1)).toEqual(["Ace", "Розыгрыш", "Обычная", 1]);
  });

  it("writes a pass taken back by an undone knockout as a minus line", () => {
    const row = buildFreeEntryGrantRow(
      { count: -1, nickname: "Ace", source: "mystery", vip: true },
      new Date("2026-09-04T18:00:00.000Z"),
    );

    expect(row.slice(2)).toEqual(["Мистери баунти", "VIP", -1]);
  });

  it("appends to the Проходки tab of the finance spreadsheet", async () => {
    process.env.GOOGLE_FINANCE_SHEET_ID = "finance-id";

    await appendFreeEntryGrant({ count: 1, nickname: "Ace", source: "raffle", vip: false });

    expect(calls.find((call) => call.method === "values.append")?.range).toContain("Проходки");
  });

  it("stays quiet when the finance spreadsheet is not configured", async () => {
    await appendFreeEntryGrant({ count: 1, nickname: "Ace", source: "raffle", vip: false });

    expect(writeCalls()).toHaveLength(0);
  });
});
