import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireTmaAuth: vi.fn() }));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
}));

const { GET, PUT } = await import("@/app/api/tma/client-bot/home-announcements/route");

type Row = {
  created_at: string;
  id: string;
  link_url: string | null;
  message: string;
  position: number;
  show_until: string | null;
};

const SOCHI_ID = "6f1c2a10-3d4e-4f50-8a6b-7c8d9e0f1a2b";
const FRIDAY_ID = "0a9b8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

/** club_home_announcements kept in memory, answering the calls the store makes. */
function announcementsTable(initial: Row[], options: { missing?: boolean } = {}) {
  let rows = [...initial];
  const missing = { code: "PGRST205", message: "Could not find the table" };

  const client = {
    from(table: string) {
      expect(table).toBe("club_home_announcements");
      return {
        select: () => ({
          order: () => ({
            order: async () =>
              options.missing
                ? { data: null, error: missing }
                : {
                  data: [...rows].sort((a, b) => a.position - b.position),
                  error: null,
                },
          }),
        }),
        upsert: async (payload: Array<Omit<Row, "created_at">>) => {
          if (options.missing) return { error: missing };
          for (const incoming of payload) {
            const existing = rows.find((row) => row.id === incoming.id);
            if (existing) Object.assign(existing, incoming);
            else rows.push({ created_at: "2026-10-19T10:00:00.000Z", ...incoming });
          }
          return { error: null };
        },
        delete: () => ({
          not: async (column: string, operator: string, value: unknown) => {
            expect(column).toBe("id");
            if (operator === "is") rows = [];
            else {
              const kept = String(value).replace(/[()]/g, "").split(",");
              rows = rows.filter((row) => kept.includes(row.id));
            }
            return { error: null };
          },
        }),
      };
    },
  };

  return { client, rows: () => rows };
}

function row(id: string, message: string, position: number, extra: Partial<Row> = {}): Row {
  return {
    created_at: "2026-10-01T10:00:00.000Z",
    id,
    link_url: null,
    message,
    position,
    show_until: null,
    ...extra,
  };
}

function save(items: unknown[]) {
  return PUT(
    new Request("http://localhost/api/tma/client-bot/home-announcements", {
      body: JSON.stringify({ items }),
      method: "PUT",
    }),
  );
}

describe("the floor's home announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists every card in the carousel's order, the expired ones too", async () => {
    const table = announcementsTable([
      row(FRIDAY_ID, "Турнир в пятницу", 1),
      row(SOCHI_ID, "Majestic едет в Сочи", 0, {
        link_url: "https://t.me/majesticpokerptz/1197",
        show_until: "2026-10-01T00:00:00.000Z",
      }),
    ]);
    mocks.requireTmaAuth.mockResolvedValue({ supabase: table.client });

    const response = await GET(new Request("http://localhost/api/tma/client-bot/home-announcements"));

    expect(await response.json()).toEqual({
      items: [
        {
          id: SOCHI_ID,
          linkUrl: "https://t.me/majesticpokerptz/1197",
          message: "Majestic едет в Сочи",
          showUntil: "2026-10-01T00:00:00.000Z",
        },
        { id: FRIDAY_ID, linkUrl: null, message: "Турнир в пятницу", showUntil: null },
      ],
    });
  });

  it("is the floor's alone", async () => {
    mocks.requireTmaAuth.mockResolvedValue({
      error: Response.json({ error: "Это доступно только флору" }, { status: 403 }),
    });

    const response = await save([]);

    expect(response.status).toBe(403);
    expect(mocks.requireTmaAuth).toHaveBeenCalledWith(expect.any(Request), { floorOnly: true });
  });

  // The desk reordered the strip, edited one card, added one and dropped another.
  it("makes the stored list exactly the one the desk saved", async () => {
    const table = announcementsTable([
      row(SOCHI_ID, "Majestic едет в Сочи", 0),
      row(FRIDAY_ID, "Турнир в пятницу", 1),
    ]);
    mocks.requireTmaAuth.mockResolvedValue({ supabase: table.client });

    const response = await save([
      { id: null, linkUrl: "t.me/majesticpokerptz/1300", message: "Новый сезон" },
      { id: FRIDAY_ID, linkUrl: "", message: "Турнир в субботу" },
    ]);

    expect(response.status).toBe(200);
    const { items } = (await response.json()) as { items: Array<{ id: string; message: string }> };
    expect(items.map((item) => item.message)).toEqual(["Новый сезон", "Турнир в субботу"]);
    expect(items[1].id).toBe(FRIDAY_ID);
    expect(table.rows().map((stored) => [stored.message, stored.position, stored.link_url])).toEqual([
      ["Турнир в субботу", 1, null],
      ["Новый сезон", 0, "https://t.me/majesticpokerptz/1300"],
    ]);
  });

  it("clears the carousel when the desk removes every card", async () => {
    const table = announcementsTable([row(SOCHI_ID, "Majestic едет в Сочи", 0)]);
    mocks.requireTmaAuth.mockResolvedValue({ supabase: table.client });

    const response = await save([]);

    expect(await response.json()).toEqual({ items: [] });
    expect(table.rows()).toEqual([]);
  });

  it("names the card the desk got wrong and stores nothing", async () => {
    const table = announcementsTable([row(SOCHI_ID, "Majestic едет в Сочи", 0)]);
    mocks.requireTmaAuth.mockResolvedValue({ supabase: table.client });

    const response = await save([{ message: "Ок" }, { linkUrl: "javascript:alert(1)", message: "Взлом" }]);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Объявление 2: ссылка должна начинаться с https://",
    });
    expect(table.rows().map((stored) => stored.message)).toEqual(["Majestic едет в Сочи"]);
  });

  it("says the migration is missing rather than failing quietly", async () => {
    const table = announcementsTable([], { missing: true });
    mocks.requireTmaAuth.mockResolvedValue({ supabase: table.client });

    const response = await GET(new Request("http://localhost/api/tma/client-bot/home-announcements"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Объявления ещё не включены: нужна миграция 202610190002",
    });
  });
});
