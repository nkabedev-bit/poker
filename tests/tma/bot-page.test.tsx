/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TMABotPage from "@/app/tma/bot/page";

describe("TMABotPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("names the schedule and the rating link fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ratingUrl: "",
          scheduleText: "",
        }),
      ),
    );

    render(<TMABotPage />);

    // Each setting is a real field with its name on it, so the desk (and a screen
    // reader) can tell the schedule from the rating link.
    const schedule = await screen.findByLabelText(/Расписание следующих турниров/);
    const rating = screen.getByLabelText(/Ссылка на Google-таблицу с рейтингом/);

    expect(schedule.tagName).toBe("TEXTAREA");
    expect(rating.getAttribute("placeholder")).toBe("https://docs.google.com/spreadsheets/...");
  });

  describe("the club's announcements", () => {
    const SOCHI = {
      id: "6f1c2a10-3d4e-4f50-8a6b-7c8d9e0f1a2b",
      linkUrl: "https://t.me/majesticpokerptz/1197",
      message: "Majestic едет в Сочи",
      showUntil: "2026-11-19T21:00:00.000Z",
    };

    function stubBotApi(announcements: Response) {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/tma/client-bot/home-announcements") {
          if (init?.method === "PUT") {
            const { items } = JSON.parse(String(init.body)) as { items: Array<Record<string, unknown>> };
            return Response.json({
              items: items.map((item, index) => ({ ...item, id: item.id ?? `saved-${index}` })),
            });
          }
          return announcements;
        }
        if (url === "/api/tma/client-bot/scheduled") return Response.json({ items: [] });
        return Response.json({ ratingUrl: "", scheduleText: "" });
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    }

    it("puts a new card first and saves the strip in its order", async () => {
      const fetchMock = stubBotApi(Response.json({ items: [SOCHI] }));

      render(<TMABotPage />);
      expect(await screen.findByDisplayValue("Majestic едет в Сочи")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /Добавить объявление/ }));
      const [fresh] = screen.getAllByLabelText("Текст объявления");
      fireEvent.change(fresh, { target: { value: "Турнир в пятницу" } });
      fireEvent.click(screen.getByRole("button", { name: "Сохранить объявления" }));

      expect(await screen.findByText("Объявления сохранены")).toBeTruthy();
      const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        items: [
          { id: null, linkUrl: "", message: "Турнир в пятницу", showUntil: null },
          { id: SOCHI.id, linkUrl: SOCHI.linkUrl, message: SOCHI.message, showUntil: SOCHI.showUntil },
        ],
      });
    });

    it("moves a card down the strip", async () => {
      stubBotApi(
        Response.json({ items: [SOCHI, { ...SOCHI, id: "second", message: "Второе", showUntil: null }] }),
      );

      render(<TMABotPage />);
      await screen.findByDisplayValue("Majestic едет в Сочи");
      fireEvent.click(screen.getAllByRole("button", { name: "Ниже" })[0]);

      const texts = screen.getAllByLabelText("Текст объявления") as HTMLTextAreaElement[];
      expect(texts.map((field) => field.value)).toEqual(["Второе", "Majestic едет в Сочи"]);
    });

    it("shows the desk what the server refused", async () => {
      const fetchMock = stubBotApi(Response.json({ items: [SOCHI] }));

      render(<TMABotPage />);
      await screen.findByDisplayValue("Majestic едет в Сочи");
      fetchMock.mockImplementation(async () =>
        Response.json({ error: "Объявление 1: ссылка должна начинаться с https://" }, { status: 400 }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Сохранить объявления" }));

      expect(await screen.findByText("Объявление 1: ссылка должна начинаться с https://")).toBeTruthy();
    });

    it("says why the strip cannot be edited before the migration", async () => {
      stubBotApi(
        Response.json({ error: "Объявления ещё не включены: нужна миграция 202610190002" }, { status: 503 }),
      );

      render(<TMABotPage />);

      expect(await screen.findByText(/нужна миграция 202610190002/)).toBeTruthy();
      await waitFor(() => expect(screen.queryByRole("button", { name: "Сохранить объявления" })).toBeNull());
    });
  });
});
