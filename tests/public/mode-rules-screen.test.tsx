/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModeRulesScreen } from "@/components/public/mode-rules-screen";
import type { ModeRules } from "@/lib/timer/mode-rules";

afterEach(() => cleanup());

const BOUNTY_RULES: ModeRules = {
  accent: "red",
  artSrc: "/modes/bounty.webp",
  description: "За каждого выбитого игрока — очки в рейтинг и фишки в стек.",
  feature: { bigBlinds: 2, kind: "bounty", points: 30 },
  key: "bounty",
  kicker: "MTT · CLASSIC",
  placePoints: [
    { place: 1, points: 450 },
    { place: 2, points: 340 },
    { place: 3, points: 280 },
    { place: 4, points: 230 },
  ],
  placePointsNote: "Рейтинговые очки · не деньги",
  stats: [
    { accent: false, label: "Стартовый стек", note: "фишек · 200 BB", value: "2 000" },
    { accent: false, label: "Ре-энтри", note: "одинарные или двойные", value: "до 3" },
    { accent: true, label: "Аддон", note: "фишек · 15 BB, на второй паузе", value: "6 000" },
  ],
  tag: "ACTION",
  title: "BOUNTY",
};

describe("ModeRulesScreen", () => {
  it("puts the game's name, its numbers and the knockout reward on the slide", () => {
    render(<ModeRulesScreen isFullscreen={false} rules={BOUNTY_RULES} onToggleFullscreen={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "BOUNTY" })).toBeTruthy();
    expect(screen.getByText("до 3")).toBeTruthy();
    expect(screen.getByText("фишек · 15 BB, на второй паузе")).toBeTruthy();
    expect(screen.getByText("+30")).toBeTruthy();
    expect(screen.getByText("+2 BB")).toBeTruthy();
  });

  it("lists the points for every scoring place", () => {
    render(<ModeRulesScreen isFullscreen={false} rules={BOUNTY_RULES} onToggleFullscreen={vi.fn()} />);

    expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "1450",
      "2340",
      "3280",
      "4230",
    ]);
  });

  it("leaves the points column out when nothing is scored", () => {
    render(
      <ModeRulesScreen
        isFullscreen={false}
        rules={{ ...BOUNTY_RULES, placePoints: [] }}
        onToggleFullscreen={vi.fn()}
      />,
    );

    expect(screen.queryByText("ITP")).toBeNull();
  });

  it("still lets the screen go fullscreen while the slide covers the board", () => {
    const onToggleFullscreen = vi.fn();
    render(<ModeRulesScreen isFullscreen={false} rules={BOUNTY_RULES} onToggleFullscreen={onToggleFullscreen} />);

    fireEvent.click(screen.getByRole("button", { name: "Полный экран" }));

    expect(onToggleFullscreen).toHaveBeenCalledOnce();
  });
});
