/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayersManager } from "@/components/admin/players-manager";
import { defaultTournamentExtras } from "@/lib/tournament-extras-shared";

describe("PlayersManager", () => {
  it("uses tournament starting stack for a newly added player", () => {
    render(
      <PlayersManager
        extras={{
          ...defaultTournamentExtras,
          settings: {
            ...defaultTournamentExtras.settings,
            addonChips: 15000,
          },
          players: [],
        }}
        saveAction={vi.fn()}
        startingStack={12000}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Добавить игрока" }));

    expect(screen.getByLabelText<HTMLInputElement>("Стек игрока").value).toBe("12000");
  });
});
