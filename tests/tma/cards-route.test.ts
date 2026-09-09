import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TournamentPlayer } from "@/lib/timer/types";
import { mergeTournamentExtras } from "@/lib/tournament-extras-shared";

const mocks = vi.hoisted(() => ({
  loadTournamentExtras: vi.fn(),
  requireTmaAuth: vi.fn(),
  saveTournamentExtras: vi.fn(),
}));

vi.mock("@/lib/tma/require-auth", () => ({ requireTmaAuth: mocks.requireTmaAuth }));
vi.mock("@/lib/tournament-extras", () => ({
  loadTournamentExtras: mocks.loadTournamentExtras,
  saveTournamentExtras: mocks.saveTournamentExtras,
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
  after: (fn: () => void) => {
    fn();
  },
}));

const { GET } = await import("@/app/api/tma/cards/route");

function player(overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    cardCode: "MJ-001",
    finishPlace: null,
    id: "player-1",
    name: "TitAn",
    rebuys: 0,
    seat: 1,
    stack: 20000,
    status: "active",
    table: 1,
    ...overrides,
  };
}

function supabaseMock() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: "tournament-1" }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(),
  };
}

async function readIssued() {
  const response = await GET(new Request("http://localhost/api/tma/cards"));
  const body = (await response.json()) as { issued: { name: string; paid: boolean }[] };

  return body.issued;
}

describe("GET /api/tma/cards — the list the desk settles from", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTmaAuth.mockResolvedValue({ error: null, supabase: supabaseMock() });
  });

  // The bug the admin hit: a tick pressed on a player who had already busted dropped
  // them out of the app entirely, and with no card left to look up there was no way
  // back to undo it.
  it("keeps a player who busted and paid on the list", async () => {
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player({ cardCode: "MJ-007", id: "gone", name: "Ушёл", paid: true, status: "eliminated" }),
        ],
      }),
    );

    expect(await readIssued()).toMatchObject([{ name: "Ушёл", paid: true }]);
  });

  it("puts those who busted on top, and those who paid at the bottom", async () => {
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player({ cardCode: "MJ-001", id: "a", name: "Играет", registrationNumber: 1 }),
          player({
            cardCode: "MJ-002",
            id: "b",
            name: "Оплатил",
            paid: true,
            registrationNumber: 2,
          }),
          player({
            cardCode: "MJ-003",
            id: "c",
            name: "Выбыл",
            registrationNumber: 3,
            status: "eliminated",
          }),
        ],
      }),
    );

    expect((await readIssued()).map((card) => card.name)).toEqual([
      "Выбыл",
      "Играет",
      "Оплатил",
    ]);
  });

  // Two who busted and two still playing: inside each group the desk reads the list by
  // the number on the ticket, the way it always has.
  it("keeps the registration order inside each group", async () => {
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player({ cardCode: "MJ-004", id: "d", name: "Выбыл 4", registrationNumber: 4, status: "eliminated" }),
          player({ cardCode: "MJ-001", id: "a", name: "Играет 1", registrationNumber: 1 }),
          player({ cardCode: "MJ-002", id: "b", name: "Выбыл 2", registrationNumber: 2, status: "eliminated" }),
          player({ cardCode: "MJ-003", id: "c", name: "Играет 3", registrationNumber: 3 }),
        ],
      }),
    );

    expect((await readIssued()).map((card) => card.name)).toEqual([
      "Выбыл 2",
      "Выбыл 4",
      "Играет 1",
      "Играет 3",
    ]);
  });

  // A card that was never handed over is not the desk's business tonight.
  it("leaves out players without a card while the club hands them out", async () => {
    mocks.loadTournamentExtras.mockResolvedValue(
      mergeTournamentExtras({
        players: [
          player({ cardCode: null, id: "no-card", name: "Без карты" }),
          player({ cardCode: "MJ-001", id: "with-card", name: "С картой" }),
        ],
      }),
    );

    expect((await readIssued()).map((card) => card.name)).toEqual(["С картой"]);
  });
});
