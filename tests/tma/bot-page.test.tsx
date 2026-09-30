/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TMABotPage from "@/app/tma/bot/page";

describe("TMABotPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
});
