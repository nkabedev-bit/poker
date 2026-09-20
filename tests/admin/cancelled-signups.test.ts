import { describe, expect, it } from "vitest";
import {
  buildCancelledSignupsMessage,
  groupCancelledSignups,
  readCancelledSignups,
  type CancelledSignup,
} from "@/lib/admin-bot/cancellations";

function signup(overrides: Partial<CancelledSignup> = {}): CancelledSignup {
  return {
    // 20:30 Moscow.
    cancelledAt: "2026-09-16T17:30:00.000Z",
    eventStartsAt: "2026-09-17T16:00:00.000Z",
    eventTitle: "Progressive Bounty",
    nickname: "Игрок",
    ...overrides,
  };
}

describe("buildCancelledSignupsMessage", () => {
  it("groups the cancellations under the evening they were going to play", () => {
    const message = buildCancelledSignupsMessage([
      signup({ nickname: "Второй", cancelledAt: "2026-09-16T18:00:00.000Z" }),
      signup({ nickname: "Первый", cancelledAt: "2026-09-15T09:05:00.000Z" }),
      signup({
        eventStartsAt: "2026-09-20T16:00:00.000Z",
        eventTitle: "Mystery Bounty",
        nickname: "Третий",
        cancelledAt: "2026-09-17T07:15:00.000Z",
      }),
    ]);

    expect(message).toContain("17.09 Progressive Bounty отменили:");
    expect(message).toContain("Первый — 15.09 в 12:05");
    expect(message).toContain("Второй — 16.09 в 21:00");
    expect(message).toContain("20.09 Mystery Bounty отменили:");
    expect(message).toContain("Третий — 17.09 в 10:15");
  });

  it("puts the nearer game first and the earlier cancellation above the later one", () => {
    const message = buildCancelledSignupsMessage([
      signup({
        eventStartsAt: "2026-09-20T16:00:00.000Z",
        eventTitle: "Mystery Bounty",
        nickname: "Поздний",
      }),
      signup({ nickname: "Ранний" }),
    ]);

    expect(message.indexOf("17.09 Progressive Bounty")).toBeLessThan(
      message.indexOf("20.09 Mystery Bounty"),
    );
  });

  it("says plainly that nobody dropped out", () => {
    expect(buildCancelledSignupsMessage([])).toContain("Никто не отменял запись");
  });

  it("names the window it was asked about", () => {
    expect(buildCancelledSignupsMessage([], 3)).toContain("за 3 дн.");
  });
});

describe("groupCancelledSignups", () => {
  // Two games can carry the same title; the date is what tells the evenings apart.
  it("keeps two evenings of one tournament apart", () => {
    const groups = groupCancelledSignups([
      signup(),
      signup({ eventStartsAt: "2026-09-24T16:00:00.000Z" }),
    ]);

    expect(groups).toHaveLength(2);
  });
});

describe("readCancelledSignups", () => {
  function supabaseStub(rows: unknown[]) {
    const calls: Record<string, unknown> = {};
    const query = {
      select(columns: string) {
        calls.columns = columns;
        return query;
      },
      eq(column: string, value: unknown) {
        calls[column] = value;
        return query;
      },
      gte(column: string, value: unknown) {
        calls.sinceColumn = column;
        calls.since = value;
        return query;
      },
      order() {
        return Promise.resolve({ data: rows, error: null });
      },
    };

    return {
      calls,
      client: { from: (table: string) => ((calls.table = table), query) },
    };
  }

  it("asks only for cancellations inside the window", async () => {
    const stub = supabaseStub([]);

    await readCancelledSignups(stub.client as never, {
      days: 5,
      now: new Date("2026-09-20T12:00:00.000Z"),
    });

    expect(stub.calls.table).toBe("event_signups");
    expect(stub.calls.status).toBe("cancelled");
    expect(stub.calls.sinceColumn).toBe("updated_at");
    expect(stub.calls.since).toBe("2026-09-15T12:00:00.000Z");
  });

  it("reads the nickname and the game out of the embedded rows", async () => {
    const stub = supabaseStub([
      {
        updated_at: "2026-09-16T17:30:00.000Z",
        client_bot_users: { display_name: "Чура" },
        tournament_events: { title: "Progressive Bounty", starts_at: "2026-09-17T16:00:00.000Z" },
      },
      // PostgREST hands an embed back as an array when it cannot prove it is one row.
      {
        updated_at: "2026-09-16T18:30:00.000Z",
        client_bot_users: [{ display_name: "Олюшка" }],
        tournament_events: [{ title: "Mystery Bounty", starts_at: "2026-09-20T16:00:00.000Z" }],
      },
    ]);

    const signups = await readCancelledSignups(stub.client as never);

    expect(signups.map((item) => item.nickname)).toEqual(["Чура", "Олюшка"]);
    expect(signups[0]?.eventTitle).toBe("Progressive Bounty");
    expect(signups[1]?.eventStartsAt).toBe("2026-09-20T16:00:00.000Z");
  });

  // An event deleted under a cancelled sign-up leaves nothing to file the line under.
  it("drops a row whose game is gone", async () => {
    const stub = supabaseStub([
      { updated_at: "2026-09-16T17:30:00.000Z", client_bot_users: null, tournament_events: null },
    ]);

    expect(await readCancelledSignups(stub.client as never)).toEqual([]);
  });
});
