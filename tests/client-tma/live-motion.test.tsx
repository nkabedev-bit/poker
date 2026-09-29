/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countPlayersIn,
  findNewlyEliminated,
  KnockoutToast,
} from "@/app/client/_components/knockout-toast";
import { LiveTables } from "@/app/client/_components/live-tables";
import { LiveTournamentCard } from "@/app/client/_components/live-tournament-card";
import { PlayerAvatar } from "@/app/client/_components/player-avatar";
import { FavoriteHandPicker } from "@/app/client/_components/favorite-hand-picker";
import type { LiveTournament } from "@/app/client/_components/use-live-tournament";
import type { LiveRoom, LiveTablePlayer } from "@/lib/tables/live-tables";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function seat(id: string, name: string, status: LiveTablePlayer["status"] = "active"): LiveTablePlayer {
  return {
    avatarUrl: null,
    bounties: null,
    finishPlace: null,
    hand: null,
    id,
    isMe: false,
    name,
    registrationNumber: null,
    seat: null,
    status,
  };
}

function room(active: string[], out: string[]): LiveRoom {
  return {
    eliminated: out.map((name) => seat(name, name, "eliminated")),
    tables: [{ number: 1, players: active.map((name) => seat(name, name)) }],
  };
}

describe("knockouts called out on the phone", () => {
  it("names only who went out since the last reading", () => {
    const before = room(["Ace", "Blinder", "River"], ["Kira"]);
    const after = room(["Ace", "River"], ["Blinder", "Kira"]);

    expect(findNewlyEliminated(before, after).map((player) => player.name)).toEqual(["Blinder"]);
    expect(findNewlyEliminated(after, after)).toEqual([]);
    expect(countPlayersIn(after)).toBe(2);
  });

  it("says who is out and how many are left, then gives the top of the screen back", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();

    render(<KnockoutToast news={{ id: "b", left: 22, name: "Blinder" }} onDone={onDone} />);
    expect(screen.getByRole("status").textContent).toBe("Blinder вылетел · осталось 22");

    act(() => vi.advanceTimersByTime(2_800));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("flashes the row of the player who just went out, and only theirs", () => {
    const { container } = render(
      <LiveTables {...room(["Ace"], ["Blinder", "Kira"])} justOut={new Set(["Blinder"])} />,
    );

    const flashing = [...container.querySelectorAll(".client-bust")].map((row) => row.textContent);
    expect(flashing).toHaveLength(1);
    expect(flashing[0]).toContain("Blinder");
  });
});

describe("the live card", () => {
  const live = (overrides: Partial<LiveTournament> = {}): LiveTournament => ({
    activePlayers: 10,
    currentLevel: {
      ante: null,
      bigBlind: 200,
      breakDurationSeconds: null,
      durationSeconds: 1200,
      isBreak: false,
      levelOrder: 3,
      smallBlind: 100,
    },
    isBreak: false,
    isPaused: false,
    nextLevel: null,
    registrationClosesAt: null,
    remainingSeconds: 300,
    roundNumber: 3,
    totalPlayers: 14,
    tournamentName: "Bounty Classic",
    ...overrides,
  });

  it("runs a bar down with the level", () => {
    const { container } = render(<LiveTournamentCard live={live()} />);

    const bar = container.querySelector<HTMLElement>('[style*="scaleX"]');
    expect(bar?.style.transform).toBe("scaleX(0.25)");
  });

  it("beats the clock in the level's last seconds, and not while the desk holds it", () => {
    const { rerender } = render(<LiveTournamentCard live={live({ remainingSeconds: 8 })} />);
    expect(screen.getByText("00:08").className).toContain("client-tick");

    rerender(<LiveTournamentCard live={live({ isPaused: true, remainingSeconds: 8 })} />);
    expect(screen.getByText("00:08").className).not.toContain("client-tick");
  });
});

describe("the favourite hand", () => {
  it("is dealt onto the face the moment it is picked, and simply sits there otherwise", () => {
    const { container, rerender } = render(<PlayerAvatar hand="QsTs" name="Ace" size={72} />);
    expect(container.querySelector(".client-hand-deal")).toBeNull();

    rerender(<PlayerAvatar dealHand hand="QsTs" name="Ace" size={72} />);
    expect(container.querySelector(".client-hand-deal [role='img']")).toBeTruthy();
  });

  it("turns a card face up once both its rank and suit are picked", () => {
    render(<FavoriteHandPicker current={null} onClose={() => {}} onSave={async () => null} />);
    const first = within(screen.getByRole("group", { name: "Первая карта" }));

    // The rank button reads "Q" as well; the card is the one that turns.
    const turned = () => first.getAllByText("Q").some((node) => node.closest(".client-card-flip"));

    fireEvent.click(first.getByRole("button", { name: "Q" }));
    expect(turned()).toBe(false);

    fireEvent.click(first.getByRole("button", { name: "пики" }));
    expect(turned()).toBe(true);
  });
});
