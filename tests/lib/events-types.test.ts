import { describe, expect, it } from "vitest";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  isEventOpenForSeating,
  isUpcomingEvent,
  mapEventRow,
  mapSignupRow,
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
    expect(mapped.maxVipPlayers).toBeNull();
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

describe("mapSignupRow", () => {
  const signupRow = {
    created_at: "2026-09-02T10:00:00.000Z",
    event_id: "22222222-2222-2222-2222-222222222222",
    id: "33333333-3333-3333-3333-333333333333",
    status: "signed_up",
    telegram_id: 42,
  };

  it("reads the ticket the player asked for", () => {
    expect(mapSignupRow({ ...signupRow, ticket_type: "vip" }).ticketType).toBe("vip");
    // A sign-up written before VIP tickets existed is a regular seat.
    expect(mapSignupRow(signupRow).ticketType).toBe("regular");
  });

  it("reads the free entry the player asked to pay with", () => {
    expect(mapSignupRow({ ...signupRow, use_pass: "vip" }).usePass).toBe("vip");
    expect(mapSignupRow({ ...signupRow, use_pass: "regular" }).usePass).toBe("regular");
  });

  it("falls back to a paid entry for rows written before passes existed", () => {
    expect(mapSignupRow(signupRow).usePass).toBe("none");
    expect(mapSignupRow({ ...signupRow, use_pass: "gold" }).usePass).toBe("none");
  });
});

describe("a poster with no VIP table", () => {
  it("keeps a zero VIP limit instead of reading it as 'not set'", () => {
    expect(mapEventRow({ ...row, max_vip_players: 0 }).maxVipPlayers).toBe(0);
  });

  it("still treats a missing limit as unset", () => {
    expect(mapEventRow({ ...row, max_vip_players: null }).maxVipPlayers).toBeNull();
  });
});

describe("what the desk is still working", () => {
  const event = (startsAt: string, lateEntryUntil: string | null = null) =>
    mapEventRow({
      id: "event-1",
      late_entry_until: lateEntryUntil,
      starts_at: startsAt,
      title: "ЧЕТВЕРГОВЫЙ",
    });

  const at = (iso: string) => new Date(iso);

  it("keeps the evening after the last entry has closed", () => {
    const thursday = event("2026-09-03T16:00:00.000Z", "2026-09-03T19:00:00.000Z");

    // A minute past the deadline nobody new may sign up — and everyone who did still
    // has to be let in.
    expect(isUpcomingEvent(thursday, at("2026-09-03T19:01:00.000Z"))).toBe(false);
    expect(isEventOpenForSeating(thursday, at("2026-09-03T19:01:00.000Z"))).toBe(true);
  });

  it("keeps a seven o'clock game through the evening", () => {
    const evening = event("2026-09-03T16:00:00.000Z");

    expect(isEventOpenForSeating(evening, at("2026-09-03T20:00:00.000Z"))).toBe(true);
    expect(isEventOpenForSeating(evening, at("2026-09-03T21:30:00.000Z"))).toBe(true);
  });

  // Six hours after a game begins at seven, it is one in the morning and the evening
  // is over.
  it("lets the evening go six hours after it started", () => {
    const evening = event("2026-09-03T16:00:00.000Z");

    expect(isEventOpenForSeating(evening, at("2026-09-03T22:01:00.000Z"))).toBe(false);
  });

  it("is open for a game that has not started", () => {
    const soon = event("2026-09-03T18:00:00.000Z");

    expect(isEventOpenForSeating(soon, at("2026-09-03T12:00:00.000Z"))).toBe(true);
  });
});
