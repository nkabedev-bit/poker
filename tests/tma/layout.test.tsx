/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TMALayout, { getTelegramWebApp, type TelegramWebApp } from "@/app/tma/layout";

const navigation = vi.hoisted(() => ({ pathname: "/tma/bot", replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
}));

function createTelegramWebApp(): TelegramWebApp {
  return {
    initData: "mock",
    ready: vi.fn(),
    expand: vi.fn(),
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    HapticFeedback: {
      impactOccurred: vi.fn(),
      notificationOccurred: vi.fn(),
    },
    MainButton: {
      setText: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      onClick: vi.fn(),
      offClick: vi.fn(),
      showProgress: vi.fn(),
      hideProgress: vi.fn(),
    },
  };
}

describe("TMALayout", () => {
  beforeEach(() => {
    navigation.pathname = "/tma/bot";
    navigation.replace.mockReset();
    window.Telegram = { WebApp: createTelegramWebApp() };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.Telegram;
  });

  // The bar sits in the column instead of over the page: pinned to the viewport it
  // covered whatever a screen put at its own bottom, and the keyboard made it drift.
  it("keeps the bottom tabs out of the content", async () => {
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    const content = await screen.findByText("TMA content");
    const main = content.closest("main");
    const nav = screen.getByRole("navigation");

    expect(main?.className).toContain("overflow-y-auto");
    expect(nav.className).not.toContain("fixed");
    expect(nav.className).toContain("shrink-0");
  });

  // The broadcast lives under "Ещё" with the posters, so that tab stays lit on it.
  it("lays out the five desk tabs and lights the one the screen belongs to", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    await screen.findByText("TMA content");

    const tabs = screen.getAllByRole("link").map((link) => link.textContent);
    expect(tabs).toEqual(["Зал", "Вылеты", "Касса", "Турнир", "Ещё"]);
    expect(screen.getByRole("link", { current: "page" }).textContent).toBe("Ещё");
  });

  it("clears the iPhone home indicator under the tabs", async () => {
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    await screen.findByText("TMA content");

    expect(screen.getByRole("navigation").className).toContain(
      "pb-[env(safe-area-inset-bottom)]",
    );
  });

  // A dealer works the tables: the room and the knockouts, nothing behind the cash desk.
  it("shows a dealer only the room and the knockouts", async () => {
    navigation.pathname = "/tma/players";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ role: "dealer" })));
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    await screen.findByText("TMA content");
    await waitFor(() =>
      expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Зал", "Вылеты"]),
    );
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("sends a dealer from a floor's screen back to the room", async () => {
    navigation.pathname = "/tma/cards";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ role: "dealer" })));
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/tma/players"));
    expect(screen.queryByText("TMA content")).toBeNull();
  });

  it("keeps a floor's screen waiting until the role is known", async () => {
    navigation.pathname = "/tma/cards";
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === "/api/tma/me"
          ? new Promise<Response>((resolve) => (answer = resolve))
          : Promise.resolve(Response.json({})),
      ),
    );
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    await screen.findByText("Загрузка…");
    expect(screen.queryByText("TMA content")).toBeNull();

    answer(Response.json({ role: "floor" }));
    await screen.findByText("TMA content");
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });
});

/** A screen asking for Telegram's big bottom button, as the room's "add player" does. */
function ScreenWithMainButton({ onPress }: { onPress: () => void }) {
  useEffect(() => {
    const tg = getTelegramWebApp();
    tg.MainButton.setText("ДОБАВИТЬ ИГРОКА");
    tg.MainButton.show();
    tg.MainButton.onClick(onPress);
    return () => {
      tg.MainButton.offClick(onPress);
      tg.MainButton.hide();
    };
  }, [onPress]);
  return <div>TMA content</div>;
}

describe("TMALayout in a phone's browser", () => {
  beforeEach(() => {
    navigation.pathname = "/tma/players";
    // Telegram's script loads outside Telegram too, only without init data.
    window.Telegram = { WebApp: { ...createTelegramWebApp(), initData: "" } };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete window.Telegram;
  });

  it("asks for the password before showing the desk", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Войдите заново" }, { status: 401 })));
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    await screen.findByText("Вход в админку");
    expect(screen.queryByText("TMA content")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("opens a dealer's tabs once the dealers' password goes in", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/tma/session"
        ? Response.json({ role: "dealer" })
        : url === "/api/tma/me"
          ? Response.json({ error: "Войдите заново" }, { status: 401 })
          : Response.json({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TMALayout>
        <div>TMA content</div>
      </TMALayout>,
    );

    fireEvent.change(await screen.findByLabelText("Пароль"), { target: { value: "dealer-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    await screen.findByText("TMA content");
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Зал", "Вылеты"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tma/session",
      expect.objectContaining({ body: JSON.stringify({ password: "dealer-password" }), method: "POST" }),
    );
  });

  it("draws Telegram's bottom button itself and passes the tap on", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === "/api/tma/me" ? { role: "floor" } : {})));
    const onPress = vi.fn();
    render(
      <TMALayout>
        <ScreenWithMainButton onPress={onPress} />
      </TMALayout>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "ДОБАВИТЬ ИГРОКА" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("answers Telegram's confirmation with the browser's own", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const answer = vi.fn();

    getTelegramWebApp().showConfirm("Удалить игрока?", answer);

    expect(window.confirm).toHaveBeenCalledWith("Удалить игрока?");
    expect(answer).toHaveBeenCalledWith(true);
  });
});
