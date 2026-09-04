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

  it("paints its labels and inputs from the Telegram theme", async () => {
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

    const scheduleLabel = (await screen.findByText("Расписание следующих турниров")).closest("label");
    const ratingLabel = screen.getByText("Ссылка на Google-таблицу с рейтингом").closest("label");

    // Colours come from Telegram's theme rather than a fixed light palette, so the
    // screen reads in both the light and the dark one.
    expect(scheduleLabel?.className).toContain("text-[var(--tg-theme-text-color)]");
    expect(ratingLabel?.className).toContain("text-[var(--tg-theme-text-color)]");

    const ratingInput = screen.getByPlaceholderText("https://docs.google.com/spreadsheets/...");

    expect(ratingInput.className).toContain("bg-[var(--tg-theme-secondary-bg-color)]");
    expect(ratingInput.className).toContain("text-[var(--tg-theme-text-color)]");
  });
});
