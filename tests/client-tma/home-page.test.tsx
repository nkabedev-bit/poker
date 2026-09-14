/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClientHomePage from "@/app/client/page";
import { ClientTMAContext } from "@/app/client/layout";

const APC_CUP_POST_URL = "https://t.me/majesticpokerptz/1069";

function stubClubApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/api/client-tma/events") {
      return Response.json({
        events: [],
        player: { displayName: "kabedev", profileSubmitted: true, username: "kabedev" },
      });
    }
    if (url === "/api/client-tma/rating") return Response.json({ players: [] });
    if (url === "/api/client-tma/announcements") {
      return Response.json({
        announcements: [{ createdAt: "2026-09-11T10:00:00.000Z", id: "a1", message: "Баунти сегодня" }],
        unread: 1,
      });
    }

    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderHome(initData: string) {
  render(
    <ClientTMAContext.Provider value={{ initData, telegramUser: null }}>
      <ClientHomePage />
    </ClientTMAContext.Provider>,
  );
}

/** The home screen opened at a given Moscow wall time. */
function openAt(moscowTime: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${moscowTime}+03:00`));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("client home: the club broadcasts", () => {
  // Players already get every broadcast from the bot; the home screen does not say it twice.
  it.each([
    ["inside Telegram", "telegram-init-data"],
    ["on the web", ""],
  ])("are not repeated on the home screen %s, and the feed is not asked for", async (_door, initData) => {
    const fetchMock = stubClubApi();

    renderHome(initData);

    expect(await screen.findByText("kabedev")).toBeTruthy();
    expect(screen.queryByText("Баунти сегодня")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/client-tma/announcements", expect.anything());
  });
});

describe("client home: the APC cup announcement", () => {
  // The last qualifier is played on 6 October and runs past midnight.
  it("points at the cup post until 10:00 Moscow time on 7 October", async () => {
    openAt("2026-10-07T09:59:00");
    stubClubApi();

    renderHome("");

    const card = await screen.findByRole("link", { name: /Кубке клубов APC/ });
    expect(card.getAttribute("href")).toBe(APC_CUP_POST_URL);
    expect(card.getAttribute("target")).toBe("_blank");
    expect(card.textContent).toContain("Нажмите, чтобы узнать подробности");
  });

  it("is gone from 10:00 Moscow time on 7 October", async () => {
    openAt("2026-10-07T10:00:00");
    stubClubApi();

    renderHome("");

    expect(await screen.findByText("kabedev")).toBeTruthy();
    expect(screen.queryByText(/Кубке клубов APC/)).toBeNull();
  });

  it("opens the post inside Telegram when the app runs there", async () => {
    openAt("2026-09-15T12:00:00");
    const openTelegramLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openTelegramLink } });
    stubClubApi();

    renderHome("telegram-init-data");
    fireEvent.click(await screen.findByRole("link", { name: /Кубке клубов APC/ }));

    expect(openTelegramLink).toHaveBeenCalledWith(APC_CUP_POST_URL);
  });

  // On the web the Telegram script is loaded as well, and its link opener would navigate
  // the app itself away; the plain link opens a new tab instead.
  it("leaves the web to the link's own new tab", async () => {
    openAt("2026-09-15T12:00:00");
    const openTelegramLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openTelegramLink } });
    stubClubApi();

    renderHome("");
    fireEvent.click(await screen.findByRole("link", { name: /Кубке клубов APC/ }));

    expect(openTelegramLink).not.toHaveBeenCalled();
  });
});
