/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENTS_TOTAL } from "@/lib/client/achievements";

vi.mock("@/app/client/layout", () => ({
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: ClientAchievementsPage } = await import("@/app/client/achievements/page");

function respondWithStats(stats: Record<string, number>) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ stats })));
}

describe("client mini-app: достижения", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists every section of the club's collection", async () => {
    respondWithStats({});

    render(<ClientAchievementsPage />);

    for (const title of [
      "Посещение игр",
      "Попадания в топ-3",
      "Победы",
      "Специальные достижения",
      "Попади в топ-9",
    ]) {
      expect(await screen.findByText(title)).toBeTruthy();
    }
  });

  it("counts what the player has earned in the header", async () => {
    respondWithStats({ games: 3 });

    render(<ClientAchievementsPage />);

    // Дебют! and Первый вайб out of the full list.
    expect(await screen.findByText(new RegExp(`2 / ${ACHIEVEMENTS_TOTAL}`))).toBeTruthy();
  });

  it("shows progress towards a goal that is still ahead", async () => {
    respondWithStats({ top3: 3 });

    render(<ClientAchievementsPage />);

    expect(await screen.findByText("Серьёзный соперник")).toBeTruthy();
    expect(screen.getByText("10 раз")).toBeTruthy();
    expect(screen.getByText("3 / 10")).toBeTruthy();
  });

  it("keeps half a knockout visible instead of rounding it away", async () => {
    respondWithStats({ bestTournamentBounty: 4.5 });

    render(<ClientAchievementsPage />);

    expect(await screen.findByText("4.5 / 5")).toBeTruthy();
  });

  it("falls back to an empty collection when the stats do not load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    render(<ClientAchievementsPage />);

    await waitFor(() =>
      expect(screen.getByText(new RegExp(`0 / ${ACHIEVEMENTS_TOTAL}`))).toBeTruthy(),
    );
  });
});
