/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClientHomePage from "@/app/client/page";
import { ClientTMAContext } from "@/app/client/layout";

const SOCHI_TRIP_POST_URL = "https://t.me/majesticpokerptz/1197";

type StubAnnouncement = { id: string; linkUrl: string | null; message: string };

const SOCHI_CARD: StubAnnouncement = {
  id: "sochi",
  linkUrl: SOCHI_TRIP_POST_URL,
  message: "Majestic едет в Сочи, нажмите для подробностей!",
};

function stubClubApi({
  announcements = [],
  nickname = "kabedev",
  webLinked = false,
}: { announcements?: StubAnnouncement[]; nickname?: string; webLinked?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/api/client-tma/events") {
      return Response.json({
        announcements,
        events: [],
        player: { displayName: nickname, profileSubmitted: true, username: "kabedev", webLinked },
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

describe("client home: the club's announcements", () => {
  it("shows a single card on its own, leading where the desk pointed it", async () => {
    stubClubApi({ announcements: [SOCHI_CARD] });

    renderHome("");

    const card = await screen.findByRole("link", { name: /Majestic едет в Сочи/ });
    expect(card.getAttribute("href")).toBe(SOCHI_TRIP_POST_URL);
    expect(card.getAttribute("target")).toBe("_blank");
    expect(card.textContent).toContain("Объявление клуба");
    expect(screen.queryByRole("button", { name: /Объявление 1 из/ })).toBeNull();
  });

  it("leaves a card without a link as plain text", async () => {
    stubClubApi({ announcements: [{ id: "season", linkUrl: null, message: "Новый сезон с 1 ноября" }] });

    renderHome("");

    expect(await screen.findByText("Новый сезон с 1 ноября")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Новый сезон/ })).toBeNull();
  });

  it("opens a Telegram post inside Telegram when the app runs there", async () => {
    const openLink = vi.fn();
    const openTelegramLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openLink, openTelegramLink } });
    stubClubApi({ announcements: [SOCHI_CARD], webLinked: true });

    renderHome("telegram-init-data");
    fireEvent.click(await screen.findByRole("link", { name: /Majestic едет в Сочи/ }));

    expect(openTelegramLink).toHaveBeenCalledWith(SOCHI_TRIP_POST_URL);
    expect(openLink).not.toHaveBeenCalled();
  });

  it("sends any other site to the phone's browser from Telegram", async () => {
    const openLink = vi.fn();
    const openTelegramLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openLink, openTelegramLink } });
    stubClubApi({
      announcements: [{ id: "map", linkUrl: "https://yandex.ru/maps/-/club", message: "Как нас найти" }],
      webLinked: true,
    });

    renderHome("telegram-init-data");
    fireEvent.click(await screen.findByRole("link", { name: /Как нас найти/ }));

    expect(openLink).toHaveBeenCalledWith("https://yandex.ru/maps/-/club");
    expect(openTelegramLink).not.toHaveBeenCalled();
  });

  // On the web the Telegram script is loaded as well, and its link opener would navigate
  // the app itself away; the plain link opens a new tab instead.
  it("leaves the web to the link's own new tab", async () => {
    const openTelegramLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openTelegramLink } });
    stubClubApi({ announcements: [SOCHI_CARD] });

    renderHome("");
    fireEvent.click(await screen.findByRole("link", { name: /Majestic едет в Сочи/ }));

    expect(openTelegramLink).not.toHaveBeenCalled();
  });

  it("turns several cards into a strip with a dot for each", async () => {
    stubClubApi({
      announcements: [SOCHI_CARD, { id: "season", linkUrl: null, message: "Новый сезон с 1 ноября" }],
    });

    renderHome("");

    const strip = await screen.findByRole("region", { name: "Объявления клуба" });
    expect(strip.querySelectorAll('[aria-roledescription="слайд"]')).toHaveLength(2);
    const dots = screen.getAllByRole("button", { name: /Объявление \d из 2/ });
    expect(dots.map((dot) => dot.getAttribute("aria-current"))).toEqual(["true", "false"]);

    fireEvent.click(dots[1]);

    expect(dots.map((dot) => dot.getAttribute("aria-current"))).toEqual(["false", "true"]);
  });

  // Inside Telegram, until the player signs in on the web, the invitation to the web app
  // is one more card of the strip, after the club's own.
  it("closes the strip with the invitation to the web app inside Telegram", async () => {
    vi.stubGlobal("Telegram", { WebApp: { openTelegramLink: vi.fn() } });
    stubClubApi({ announcements: [SOCHI_CARD] });

    renderHome("telegram-init-data");

    const strip = await screen.findByRole("region", { name: "Объявления клуба" });
    const slides = Array.from(strip.querySelectorAll('[aria-roledescription="слайд"]'));
    expect(slides.map((slide) => slide.textContent)).toEqual([
      expect.stringContaining("едет в Сочи"),
      expect.stringContaining("Добавьте Majestic на главный экран"),
    ]);
  });

  it("shows no announcement at all when the club has none", async () => {
    stubClubApi();

    renderHome("");

    expect(await screen.findByText("kabedev")).toBeTruthy();
    expect(screen.queryByText("Объявление клуба")).toBeNull();
  });
});

describe("client home: the APC Side Event plate", () => {
  it("stands beside Secret's own tier", async () => {
    stubClubApi({ nickname: "Secret" });

    renderHome("");

    expect(await screen.findByText("2-ое место в Side Event APC")).toBeTruthy();
  });

  it("is nobody else's", async () => {
    stubClubApi();

    renderHome("");

    expect(await screen.findByText("kabedev")).toBeTruthy();
    expect(screen.queryByText("2-ое место в Side Event APC")).toBeNull();
  });
});
