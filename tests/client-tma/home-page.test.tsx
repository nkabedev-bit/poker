/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClientHomePage from "@/app/client/page";
import { ClientTMAContext } from "@/app/client/layout";

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
