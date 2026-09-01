import { describe, expect, it } from "vitest";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  isUpcomingEvent,
  mapEventRow,
  toEventRow,
  type TournamentEvent,
} from "@/lib/events/types";

const row = {
  badge: "  Новый формат!  ",
  buy_in: 1500,
  features_text: "Без re-entry",
  id: "11111111-1111-1111-1111-111111111111",
  is_published: true,
  late_entry_until: "2026-09-01T19:10:00.000Z",
  max_players: 90,
  poster_url: "  ",
  rules_text: "Один шанс",
  starting_stack: 120000,
  starts_at: "2026-09-01T16:00:00.000Z",
  title: "ONE SHOT KNOCKOUT",
  venue_address: "Москва, Большая Новодмитровская улица, 36с13",
  vip_buy_in: 2000,
};

function event(overrides: Partial<TournamentEvent> = {}): TournamentEvent {
  return { ...mapEventRow(row), ...overrides };
}

describe("mapEventRow", () => {
  it("trims optional text and drops empty strings", () => {
    const mapped = mapEventRow(row);

    expect(mapped.badge).toBe("Новый формат!");
    expect(mapped.posterUrl).toBeNull();
  });

  it("reads the VIP ticket price, or null when the game has no VIP seat", () => {
    expect(mapEventRow(row).vipBuyIn).toBe(2000);
    expect(mapEventRow({ ...row, vip_buy_in: null }).vipBuyIn).toBeNull();
  });

  it("rejects non-positive counts instead of surfacing zeros", () => {
    const mapped = mapEventRow({ ...row, max_players: 0, starting_stack: -5 });

    expect(mapped.maxPlayers).toBeNull();
    expect(mapped.startingStack).toBeNull();
  });

  it("round-trips through toEventRow", () => {
    const mapped = mapEventRow(row);

    expect(toEventRow(mapped)).toMatchObject({
      buy_in: 1500,
      vip_buy_in: 2000,
      is_published: true,
      max_players: 90,
      starts_at: "2026-09-01T16:00:00.000Z",
      title: "ONE SHOT KNOCKOUT",
    });
  });
});

describe("event labels", () => {
  // The club quotes Moscow wall time on its posters; the server runs in UTC.
  it("renders the day and time in Moscow time", () => {
    expect(formatEventDayLabel(row.starts_at)).toBe("1 сентября");
    expect(formatEventTimeLabel(row.starts_at)).toBe("19:00");
  });
});

describe("isUpcomingEvent", () => {
  it("keeps a started game listed until late entry closes", () => {
    const started = new Date("2026-09-01T19:05:00.000Z");

    expect(isUpcomingEvent(event(), started)).toBe(true);
  });

  it("drops the game once late entry is over", () => {
    const afterCutoff = new Date("2026-09-01T19:11:00.000Z");

    expect(isUpcomingEvent(event(), afterCutoff)).toBe(false);
  });

  it("falls back to the start time when there is no late entry", () => {
    const justAfterStart = new Date("2026-09-01T16:01:00.000Z");

    expect(isUpcomingEvent(event({ lateEntryUntil: null }), justAfterStart)).toBe(false);
  });
});
