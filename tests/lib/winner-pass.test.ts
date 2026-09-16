import { beforeEach, describe, expect, it, vi } from "vitest";
import { findTournamentWinner, WINNER_PASS_MESSAGE } from "@/lib/free-entries/winner";
import type { TournamentPlayer } from "@/lib/timer/types";

const mocks = vi.hoisted(() => ({
  adjustFreeEntries: vi.fn(),
  appendFreeEntryGrant: vi.fn(),
  notifyClientUser: vi.fn(),
}));

vi.mock("@/lib/free-entries/adjust", () => ({ adjustFreeEntries: mocks.adjustFreeEntries }));
vi.mock("@/lib/client-bot/notify", () => ({ notifyClientUser: mocks.notifyClientUser }));
vi.mock("@/lib/google-sheets", () => ({ appendFreeEntryGrant: mocks.appendFreeEntryGrant }));

function player(id: string, overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
  return {
    id,
    name: `Игрок ${id}`,
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    rebuys: 0,
    status: "active",
    ...overrides,
  } as TournamentPlayer;
}

const supabase = {} as never;

describe("findTournamentWinner", () => {
  it("picks the player in first place", () => {
    const winner = player("a", { finishPlace: 1 });
    expect(findTournamentWinner([player("b", { finishPlace: 2 }), winner])).toBe(winner);
  });

  it("finds nobody when the tournament was closed with players still in", () => {
    expect(findTournamentWinner([player("a"), player("b"), player("c", { finishPlace: 3 })])).toBeNull();
  });
});

describe("grantWinnerPass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adjustFreeEntries.mockResolvedValue({ after: 1, before: 0 });
  });

  it("credits a regular pass, logs it and tells the winner in the bot", async () => {
    const { grantWinnerPass } = await import("@/lib/free-entries/winner-pass");

    await grantWinnerPass(supabase, [
      player("a", { accountId: "acc-1", finishPlace: 1, name: "1$", telegramId: 77 }),
      player("b", { accountId: "acc-2", finishPlace: 2 }),
    ]);

    expect(mocks.adjustFreeEntries).toHaveBeenCalledTimes(1);
    expect(mocks.adjustFreeEntries).toHaveBeenCalledWith(supabase, {
      delta: 1,
      holder: { accountId: "acc-1", telegramId: 77 },
      vip: false,
    });
    expect(mocks.appendFreeEntryGrant).toHaveBeenCalledWith({
      count: 1,
      nickname: "1$",
      source: "win",
      vip: false,
    });
    expect(mocks.notifyClientUser).toHaveBeenCalledWith(supabase, "acc-1", WINNER_PASS_MESSAGE);
  });

  it("does nothing without a first place", async () => {
    const { grantWinnerPass } = await import("@/lib/free-entries/winner-pass");

    await grantWinnerPass(supabase, [player("a"), player("b")]);

    expect(mocks.adjustFreeEntries).not.toHaveBeenCalled();
    expect(mocks.appendFreeEntryGrant).not.toHaveBeenCalled();
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  it("logs the pass but sends no message to a winner added by hand", async () => {
    const { grantWinnerPass } = await import("@/lib/free-entries/winner-pass");

    await grantWinnerPass(supabase, [player("a", { finishPlace: 1, name: "Гость" })]);

    expect(mocks.adjustFreeEntries).not.toHaveBeenCalled();
    expect(mocks.appendFreeEntryGrant).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: "Гость", source: "win" }),
    );
    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });

  it("does not promise a pass that failed to credit", async () => {
    mocks.adjustFreeEntries.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { grantWinnerPass } = await import("@/lib/free-entries/winner-pass");

    await grantWinnerPass(supabase, [player("a", { accountId: "acc-1", finishPlace: 1 })]);

    expect(mocks.notifyClientUser).not.toHaveBeenCalled();
  });
});
