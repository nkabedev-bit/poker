/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LiveTournamentCard } from "@/app/client/_components/live-tournament-card";
import { LiveTables } from "@/app/client/_components/live-tables";
import { SignupList } from "@/app/client/_components/signup-list";
import type { LiveTournament } from "@/app/client/_components/use-live-tournament";

afterEach(cleanup);

const NOW = new Date("2026-09-20T15:00:00.000Z");

function live(overrides: Partial<LiveTournament> = {}): LiveTournament {
  return {
    activePlayers: 10,
    currentLevel: {
      ante: 200,
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
    registrationClosesAt: "2026-09-20T17:24:00.000Z",
    remainingSeconds: 266,
    roundNumber: 3,
    totalPlayers: 14,
    tournamentName: "Bounty Classic",
    ...overrides,
  };
}

describe("LiveTournamentCard", () => {
  // What a player on their way to the club actually asks: which level, how long it has
  // left, how many are still in, and whether they can still make it in time to play.
  it("shows the round, the clock, the blinds and how long registration has left", () => {
    render(<LiveTournamentCard live={live()} now={NOW} />);

    expect(screen.getByText("Bounty Classic")).toBeTruthy();
    expect(screen.getByText("3 уровень")).toBeTruthy();
    // The same clock the hall's screen shows, to the leading zero.
    expect(screen.getByText("04:26")).toBeTruthy();
    expect(screen.getByText("100/200")).toBeTruthy();
    expect(screen.getByText("Анте 200")).toBeTruthy();
    expect(screen.getByText("2 ч 24 мин")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("says the room is on a break instead of naming a round", () => {
    render(<LiveTournamentCard live={live({ isBreak: true })} now={NOW} />);

    expect(screen.getAllByText("перерыв").length).toBeGreaterThan(0);
    expect(screen.queryByText("3 уровень")).toBeNull();
  });

  it("says so while the desk holds the clock", () => {
    render(<LiveTournamentCard live={live({ isPaused: true })} now={NOW} />);

    expect(screen.getByText("пауза")).toBeTruthy();
  });

  it("drops the registration line once the window has closed", () => {
    render(<LiveTournamentCard live={live({ registrationClosesAt: null })} now={NOW} />);

    expect(screen.queryByText("Запись ещё")).toBeNull();
  });
});

describe("LiveTables", () => {
  it("shows each table, who is still in at it and who went out from it", () => {
    render(
      <LiveTables
        tables={[
          {
            activeCount: 1,
            number: 1,
            players: [
              {
                avatarUrl: null,
                finishPlace: null,
                id: "a",
                isMe: false,
                name: "Играет",
                registrationNumber: 4,
                seat: 2,
                status: "active",
              },
              {
                avatarUrl: null,
                finishPlace: 9,
                id: "b",
                isMe: false,
                name: "Выбыл",
                registrationNumber: 7,
                seat: 5,
                status: "eliminated",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Стол 1")).toBeTruthy();
    expect(screen.getByText("1 из 2")).toBeTruthy();
    expect(screen.getByText("Играет")).toBeTruthy();
    expect(screen.getByText("#4 · место 2")).toBeTruthy();
    expect(screen.getByText("9 место")).toBeTruthy();
  });

  it("says plainly when nobody has sat down yet", () => {
    render(<LiveTables tables={[]} />);

    expect(screen.getByText("Игроков за столами пока нет.")).toBeTruthy();
  });
});

describe("SignupList", () => {
  const entry = (name: string, overrides = {}) => ({
    avatarUrl: null,
    isGuest: false,
    isMe: false,
    key: name,
    name,
    ticketType: "regular" as const,
    ...overrides,
  });

  it("lists who is coming and keeps the queue apart from the tickets", () => {
    render(
      <SignupList
        players={[entry("Чура"), entry("ВИП-гость", { ticketType: "vip" as const })]}
        waitlist={[entry("В очереди")]}
      />,
    );

    expect(screen.getByText("Чура")).toBeTruthy();
    expect(screen.getByText("VIP")).toBeTruthy();
    expect(screen.getByText("Лист ожидания")).toBeTruthy();
    expect(screen.getByText("В очереди")).toBeTruthy();
  });

  it("invites the first player in when nobody has signed up", () => {
    render(<SignupList players={[]} />);

    expect(screen.getByText("Пока никто не записался. Будьте первым.")).toBeTruthy();
  });
});
