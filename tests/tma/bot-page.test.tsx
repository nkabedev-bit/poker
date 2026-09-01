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

  it("uses readable dark labels and white inputs for bot settings", async () => {
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

    expect(scheduleLabel?.className).toContain("text-black");
    expect(ratingLabel?.className).toContain("text-black");

    const ratingInput = screen.getByPlaceholderText("https://docs.google.com/spreadsheets/...");

    expect(ratingInput.className).toContain("bg-white");
    expect(ratingInput.className).toContain("text-black");
  });
});
