/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/client" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import {
  formatOfferClock,
  OfferCountdown,
  readOfferClock,
} from "@/app/client/_components/offer-countdown";
import { rememberWelcome, WelcomeSplash } from "@/app/client/_components/welcome-splash";
import { useSuitBurst } from "@/app/client/_components/suit-burst";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
  navigation.pathname = "/client";
});

const NOW = Date.parse("2026-10-03T16:00:00.000Z");
const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe("the clock on a seat the queue is holding", () => {
  it("counts whole seconds and grows urgent at five minutes and at two", () => {
    expect(readOfferClock(inMinutes(30), NOW)).toEqual({ secondsLeft: 1800, share: 1, urgency: "calm" });
    expect(readOfferClock(inMinutes(5), NOW).urgency).toBe("soon");
    expect(readOfferClock(inMinutes(2), NOW).urgency).toBe("last");
    expect(readOfferClock(inMinutes(0), NOW)).toEqual({ secondsLeft: 0, share: 0, urgency: "over" });
    // Half a second left still reads as a second on the clock, not as time already up.
    expect(readOfferClock(new Date(NOW + 500).toISOString(), NOW).secondsLeft).toBe(1);
  });

  it("starts a hold cut short by registration closing on part of the ring", () => {
    expect(readOfferClock(inMinutes(15), NOW).share).toBe(0.5);
  });

  it("treats a deadline it cannot read as over rather than as endless", () => {
    expect(readOfferClock("not a date", NOW).urgency).toBe("over");
  });

  it("reads minutes and seconds the way the hall clock does", () => {
    expect(formatOfferClock(1800)).toBe("30:00");
    expect(formatOfferClock(425)).toBe("07:05");
    expect(formatOfferClock(0)).toBe("00:00");
  });

  it("runs down on the phone and asks the club once when the time is up", () => {
    vi.useFakeTimers({ now: NOW });
    const onExpire = vi.fn();

    render(<OfferCountdown expiresAt={new Date(NOW + 3_000).toISOString()} onExpire={onExpire} />);
    expect(screen.getByText("00:03")).toBeTruthy();

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("00:02")).toBeTruthy();
    expect(onExpire).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByText("Время вышло")).toBeTruthy();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe("the newcomer's welcome", () => {
  it("greets once on the home screen after the questionnaire, then gives the screen back", () => {
    vi.useFakeTimers();
    rememberWelcome();

    render(<WelcomeSplash />);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText("Добро пожаловать в Majestic")).toBeTruthy();
    expect(window.sessionStorage.getItem("club:welcome")).toBeNull();

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.queryByText("Добро пожаловать в Majestic")).toBeNull();
  });

  it("keeps the welcome for the home screen while the player is elsewhere", () => {
    vi.useFakeTimers();
    navigation.pathname = "/client/onboarding";
    rememberWelcome();

    render(<WelcomeSplash />);
    act(() => vi.advanceTimersByTime(10));

    expect(screen.queryByText("Добро пожаловать в Majestic")).toBeNull();
    expect(window.sessionStorage.getItem("club:welcome")).toBe("1");
  });

  it("stays away on every other visit to the home screen", () => {
    vi.useFakeTimers();
    render(<WelcomeSplash />);
    act(() => vi.advanceTimersByTime(10));

    expect(screen.queryByText("Добро пожаловать в Majestic")).toBeNull();
  });
});

function Burst() {
  const { burst, fire } = useSuitBurst(8);

  return (
    <div>
      <button type="button" onClick={fire}>
        Записаться
      </button>
      {burst}
    </div>
  );
}

describe("the suits thrown up for a seat taken", () => {
  it("throws a handful of suits and clears them away a moment later", () => {
    vi.useFakeTimers();
    const { container } = render(<Burst />);
    expect(container.querySelectorAll(".client-confetti")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Записаться" }));
    const suits = [...container.querySelectorAll(".client-confetti")].map((node) => node.textContent);
    expect(suits).toEqual(["♠", "♥", "♦", "♣", "♠", "♥", "♦", "♣"]);

    act(() => vi.advanceTimersByTime(1_600));
    expect(container.querySelectorAll(".client-confetti")).toHaveLength(0);
  });
});
