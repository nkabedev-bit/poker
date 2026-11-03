/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RatingPlayer } from "@/app/client/_components/rating-row";

const telegram = vi.hoisted(() => ({ webApp: null as Record<string, unknown> | null }));

vi.mock("@/app/client/layout", () => ({
  getClientTelegramWebApp: () => telegram.webApp,
}));

const { SeasonGamesSheet } = await import("@/app/client/_components/season-games-sheet");

const NUTS: RatingPlayer = {
  avatarUrl: null,
  eliminations: 3,
  games: 3,
  isMe: false,
  name: "Nuts",
  place: 12,
  points: 412,
  top9: 0,
};

const PHOENIX = { place: 1, points: 300, startedAt: "2026-10-14T16:00:00.000Z", title: "Phoenix" };
const DEEP_STACK = { place: 3, points: 112, startedAt: "2026-10-28T16:00:00.000Z", title: "Deep Stack" };
const FREEROLL = { place: 18, points: 40, startedAt: "2026-10-21T16:00:00.000Z", title: "Freeroll" };

function open(
  games: Record<string, unknown>,
  {
    onClose = () => {},
    player = NUTS,
    status = "open",
  }: { onClose?: () => void; player?: RatingPlayer; status?: "open" | "closed" } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(games)),
  );

  return render(
    <SeasonGamesSheet initData="mock-init" player={player} season={{ id: "s1", status }} onClose={onClose} />,
  );
}

const SPLIT = {
  counted: [PHOENIX, DEEP_STACK],
  countedGames: 2,
  dropped: [FREEROLL],
  next: { kind: "beat", points: 112 },
};

afterEach(() => {
  cleanup();
  telegram.webApp = null;
  vi.unstubAllGlobals();
});

describe("a player's games in a season", () => {
  it("puts the counted games first and the rest in a group of their own", async () => {
    open(SPLIT);

    const counted = (await screen.findByText("Phoenix")).closest("section") as HTMLElement;
    const dropped = screen.getByText("Freeroll").closest("section") as HTMLElement;

    expect(counted.textContent).toContain("В зачёте · 2");
    expect(within(counted).getByText("Deep Stack")).toBeTruthy();
    expect(dropped.textContent).toContain("Не в зачёте · 1");
    expect(counted.compareDocumentPosition(dropped) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the place and the points of each game", async () => {
    open(SPLIT);
    const phoenix = (await screen.findByText("Phoenix")).closest("a") as HTMLElement;

    expect(within(phoenix).getByText("14 октября · 1 место")).toBeTruthy();
    expect(within(phoenix).getByText("300")).toBeTruthy();
  });

  it("greys out only the games that stay behind", async () => {
    open(SPLIT);

    expect((await screen.findByText("Freeroll")).className).toContain("text-club-faint");
    expect(screen.getByText("Phoenix").className).not.toContain("text-club-faint");
  });

  it("leads each game to its finishing table", async () => {
    open(SPLIT);
    const freeroll = (await screen.findByText("Freeroll")).closest("a");

    expect(freeroll?.getAttribute("href")).toBe(
      `/client/games/${encodeURIComponent("2026-10-21T16:00:00.000Z")}`,
    );
  });

  it("says the rule, and what the next game has to beat", async () => {
    open(SPLIT);

    expect(await screen.findByText("В зачёт идут 2 лучшие из 3 игр")).toBeTruthy();
    expect(screen.getByText("Следующая игра заменит худшую, если набрать больше 112 очков")).toBeTruthy();
  });

  it("says how many more games count in any case below the limit", async () => {
    open({
      counted: [PHOENIX],
      countedGames: 6,
      dropped: [],
      next: { kind: "any", left: 5 },
    });

    expect(await screen.findByText("В зачёт идут 6 лучших игр, сыграно 1")).toBeTruthy();
    expect(screen.getByText("Ещё 5 игр пойдут в зачёт в любом случае")).toBeTruthy();
    expect(screen.queryByText(/Не в зачёте/)).toBeNull();
  });

  it("agrees its words with one more game", async () => {
    open({ counted: [PHOENIX], countedGames: 2, dropped: [], next: { kind: "any", left: 1 } });

    expect(await screen.findByText("Ещё 1 игра пойдёт в зачёт в любом случае")).toBeTruthy();
  });

  it("speaks of a season without a limit as counting every game", async () => {
    open({ counted: [PHOENIX, FREEROLL], countedGames: null, dropped: [], next: null });

    expect(await screen.findByText("В зачёт идут все игры")).toBeTruthy();
  });

  it("speaks of a closed season in the past, with no next game", async () => {
    open(
      { counted: [PHOENIX, DEEP_STACK], countedGames: 2, dropped: [FREEROLL], next: null },
      { status: "closed" },
    );

    expect(await screen.findByText("В зачёт шли 2 лучшие из 3 игр")).toBeTruthy();
    expect(screen.queryByText(/Следующая игра/)).toBeNull();
  });

  // 68 lines of the summer's frozen tables do not add up to the games stored for them: the
  // sheet says so rather than letting the sum look like a mistake.
  it("warns when a closed season's table differs from its games", async () => {
    open(
      { counted: [PHOENIX], countedGames: 5, dropped: [], next: null },
      { player: { ...NUTS, points: 999 }, status: "closed" },
    );

    expect(await screen.findByText(/зафиксирован при закрытии/)).toBeTruthy();
  });

  it("keeps quiet when a closed season's table adds up", async () => {
    open(
      { counted: [PHOENIX, DEEP_STACK], countedGames: 2, dropped: [], next: null },
      { status: "closed" },
    );
    await screen.findByText("Phoenix");

    expect(screen.queryByText(/зафиксирован при закрытии/)).toBeNull();
  });

  it("says a closed season has only its totals when no games were kept", async () => {
    open({ counted: [], countedGames: 5, dropped: [], next: null }, { status: "closed" });

    expect(await screen.findByText("Игры этого сезона не сохранились: есть только итог.")).toBeTruthy();
    expect(screen.queryByText(/зафиксирован при закрытии/)).toBeNull();
  });

  it("says when a player has no games in the season yet", async () => {
    open(
      { counted: [], countedGames: 6, dropped: [], next: { kind: "any", left: 6 } },
      { player: { ...NUTS, place: null, points: null } },
    );

    expect(await screen.findByText("В этом зачёте игр пока нет.")).toBeTruthy();
    expect(screen.getByText("Нет в таблице")).toBeTruthy();
  });
});

describe("closing the sheet with a swipe", () => {
  function swipe(sheet: HTMLElement, distance: number) {
    fireEvent.touchStart(sheet, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientY: 100 + distance }] });
    fireEvent.touchEnd(sheet);
  }

  function sheetOf() {
    return screen.getByRole("dialog").firstElementChild as HTMLElement;
  }

  it("lets go when pulled far enough", async () => {
    const onClose = vi.fn();
    open(SPLIT, { onClose });
    await screen.findByText("Phoenix");

    swipe(sheetOf(), 140);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("springs back from a short pull", async () => {
    const onClose = vi.fn();
    open(SPLIT, { onClose });
    await screen.findByText("Phoenix");

    swipe(sheetOf(), 40);

    expect(onClose).not.toHaveBeenCalled();
    expect(sheetOf().style.transform).toBe("");
  });

  it("scrolls the list instead when it is not at the top", async () => {
    const onClose = vi.fn();
    open(SPLIT, { onClose });
    await screen.findByText("Phoenix");
    sheetOf().scrollTop = 200;

    swipe(sheetOf(), 140);

    expect(onClose).not.toHaveBeenCalled();
  });

  // Telegram folds the app away on a swipe down, which is what this swipe looks like.
  it("holds Telegram's own swipe back while it is open", async () => {
    const webApp = {
      disableVerticalSwipes: vi.fn(),
      enableVerticalSwipes: vi.fn(),
      isVersionAtLeast: () => true,
      isVerticalSwipesEnabled: true,
    };
    telegram.webApp = webApp;

    const { unmount } = open(SPLIT);
    await screen.findByText("Phoenix");

    expect(webApp.disableVerticalSwipes).toHaveBeenCalledOnce();
    unmount();
    expect(webApp.enableVerticalSwipes).toHaveBeenCalledOnce();
  });
});
