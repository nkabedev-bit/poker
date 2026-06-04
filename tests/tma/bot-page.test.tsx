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
          registrationCode: "",
          scheduleText: "",
        }),
      ),
    );

    render(<TMABotPage />);

    const scheduleLabel = (await screen.findByText("Расписание следующих турниров")).closest("label");
    const codeLabel = screen.getByText("Кодовое слово").closest("label");
    const ratingLabel = screen.getByText("Ссылка на Google-таблицу с рейтингом").closest("label");

    expect(scheduleLabel?.className).toContain("text-black");
    expect(codeLabel?.className).toContain("text-black");
    expect(ratingLabel?.className).toContain("text-black");

    const codeInput = screen.getByPlaceholderText("Код для регистрации");
    const ratingInput = screen.getByPlaceholderText("https://docs.google.com/spreadsheets/...");

    expect(codeInput.className).toContain("bg-white");
    expect(codeInput.className).toContain("text-black");
    expect(ratingInput.className).toContain("bg-white");
    expect(ratingInput.className).toContain("text-black");
  });
});
