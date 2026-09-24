/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ id: "title-collector" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: route.id }) }));
vi.mock("@/app/client/layout", () => ({
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: AchievementHoldersPage } = await import("@/app/client/achievements/[id]/page");

type Holder = { avatarUrl: string | null; isMe: boolean; key: string; name: string; value: number };

function respondWith(body: { holders: Holder[]; players: number } | null, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => (body ? Response.json(body, { status }) : new Response(null, { status }))),
  );
}

describe("client mini-app: у кого есть достижение", () => {
  beforeEach(() => {
    route.id = "title-collector";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows how rare the badge is and who holds it, the player's own line marked", async () => {
    respondWith({
      holders: [
        { avatarUrl: null, isMe: false, key: "anna", name: "Anna", value: 5 },
        { avatarUrl: null, isMe: true, key: "kabedev", name: "Kabedev", value: 3 },
      ],
      players: 16,
    });

    render(<AchievementHoldersPage />);

    expect(await screen.findByText("Коллекционер титулов")).toBeTruthy();
    expect(screen.getByText("3 победы")).toBeTruthy();
    expect(screen.getByText("12,5%")).toBeTruthy();
    expect(screen.getByText("2 из 16")).toBeTruthy();
    expect(screen.getByText("вы")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("Anna").closest("a")?.getAttribute("href")).toBe("/client/players/anna");
  });

  it("says nobody holds it yet", async () => {
    route.id = "butcher";
    respondWith({ holders: [], players: 16 });

    render(<AchievementHoldersPage />);

    expect(await screen.findByText("Мясник")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText("Пока ни у кого нет этого достижения.")).toBeTruthy();
  });

  it("owns up to an address that leads to no achievement", async () => {
    route.id = "free-drinks";
    respondWith(null, 404);

    render(<AchievementHoldersPage />);

    expect(await screen.findByText("Достижение не найдено")).toBeTruthy();
  });

  it("says the list did not load rather than claiming nobody holds the badge", async () => {
    respondWith(null, 500);

    render(<AchievementHoldersPage />);

    expect(await screen.findByText("Не удалось загрузить список")).toBeTruthy();
    expect(screen.queryByText("Пока ни у кого нет этого достижения.")).toBeNull();
  });
});
