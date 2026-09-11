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

describe("client home: the club announcement", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Players already get every announcement from the bot; the card only said it twice.
  it.each([
    ["inside Telegram", "telegram-init-data"],
    ["on the web", ""],
  ])("is not on the home screen %s, and the feed is not asked for", async (_door, initData) => {
    const fetchMock = stubClubApi();

    render(
      <ClientTMAContext.Provider value={{ initData, telegramUser: null }}>
        <ClientHomePage />
      </ClientTMAContext.Provider>,
    );

    expect(await screen.findByText("kabedev")).toBeTruthy();
    expect(screen.queryByText(/объявление клуба/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/client-tma/announcements", expect.anything());
  });
});
