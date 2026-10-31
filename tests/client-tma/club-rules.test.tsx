/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClientHomePage from "@/app/client/page";
import { ClientTMAContext } from "@/app/client/layout";
import { CLUB_RULES_URL, hasAcceptedCurrentRules } from "@/lib/client/club-rules";

const RULES_PDF = `http://localhost:3000${CLUB_RULES_URL}`;

function stubClubApi({ rulesAccepted }: { rulesAccepted?: boolean }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url === "/api/client-tma/events") {
      return Response.json({
        events: [],
        player: { displayName: "kabedev", profileSubmitted: true, rulesAccepted, username: "kabedev", webLinked: true },
      });
    }
    if (url === "/api/client-tma/rating") return Response.json({ players: [] });
    if (url === "/api/client-tma/rules") return Response.json({ acceptedAt: "2026-10-31T09:00:00.000Z" });

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
  vi.unstubAllGlobals();
});

describe("client home: the reminder about the club's rules", () => {
  it("holds the player until they tick that they have read the rules", async () => {
    const fetchMock = stubClubApi({ rulesAccepted: false });

    renderHome("telegram-init-data");

    const sheet = await screen.findByRole("dialog", { name: "Правила клуба" });
    expect(sheet.textContent).toContain("В спорных ситуациях клуб руководствуется этими правилами");

    const proceed = screen.getByRole("button", { name: "Продолжить" }) as HTMLButtonElement;
    expect(proceed.disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "С правилами ознакомлен" }));
    expect(proceed.disabled).toBe(false);
    fireEvent.click(proceed);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Правила клуба" })).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/client-tma/rules", {
      headers: { "X-Telegram-Init-Data": "telegram-init-data" },
      method: "POST",
    });
  });

  it("stays open when the agreement could not be stored", async () => {
    const alert = vi.fn();
    vi.stubGlobal("alert", alert);
    const fetchMock = stubClubApi({ rulesAccepted: false });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/client-tma/rules") return Response.json({ message: "База не ответила" }, { status: 500 });
      if (url === "/api/client-tma/events") {
        return Response.json({ events: [], player: { displayName: "kabedev", profileSubmitted: true, rulesAccepted: false } });
      }
      return Response.json({ players: [] });
    });

    renderHome("");
    await screen.findByRole("dialog", { name: "Правила клуба" });
    fireEvent.click(screen.getByRole("checkbox", { name: "С правилами ознакомлен" }));
    fireEvent.click(screen.getByRole("button", { name: "Продолжить" }));

    await waitFor(() => expect(alert).toHaveBeenCalledWith("База не ответила"));
    expect(screen.getByRole("dialog", { name: "Правила клуба" })).toBeTruthy();
  });

  it.each([
    ["has already agreed", true],
    ["is served by an older server", undefined],
  ])("does not show up when the player %s", async (_case, rulesAccepted) => {
    stubClubApi({ rulesAccepted });

    renderHome("");

    expect(await screen.findByText("kabedev")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Правила клуба" })).toBeNull();
  });
});

describe("client home: the rules at the foot of the screen", () => {
  it("sends the PDF to the phone's browser from Telegram", async () => {
    const openLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openLink } });
    stubClubApi({ rulesAccepted: true });

    renderHome("telegram-init-data");
    fireEvent.click(await screen.findByRole("button", { name: /Правила клуба/ }));

    expect(openLink).toHaveBeenCalledWith(RULES_PDF);
  });

  it("opens the PDF in a tab of its own on the web", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    stubClubApi({ rulesAccepted: true });

    renderHome("");
    fireEvent.click(await screen.findByRole("button", { name: /Правила клуба/ }));

    expect(open).toHaveBeenCalledWith(RULES_PDF, "_blank", "noopener");
  });
});

describe("agreeing to the club's rules", () => {
  it("counts an agreement given to the rules as they stand", () => {
    expect(hasAcceptedCurrentRules("2026-10-31T12:00:00.000Z")).toBe(true);
  });

  it("asks again once the rules have changed since", () => {
    expect(hasAcceptedCurrentRules("2026-10-20T12:00:00.000Z")).toBe(false);
  });

  it("asks a player who never agreed", () => {
    expect(hasAcceptedCurrentRules(null)).toBe(false);
    expect(hasAcceptedCurrentRules("not a date")).toBe(false);
  });
});
