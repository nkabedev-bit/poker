import { describe, expect, it } from "vitest";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  holdsTicket,
  isCancellationClosed,
  isEventEveningOpen,
  isEventOpenForSeating,
  isEventPlayingToday,
  isUpcomingEvent,
  keepLatestPastEvent,
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

  // The club counts by the day, not by the clock: a four o'clock game is the evening's
  // game until that evening is over, however late the player walks in.
  it("keeps an afternoon game to the end of its day", () => {
    // 16:00 in Moscow, and a player at half past eleven at night.
    const afternoon = event("2026-09-03T13:00:00.000Z");

    expect(isEventOpenForSeating(afternoon, at("2026-09-03T14:30:00.000Z"))).toBe(true);
    expect(isEventOpenForSeating(afternoon, at("2026-09-03T20:30:00.000Z"))).toBe(true);
  });

  // Six hours after a game begins at seven, it is one in the morning and the evening
  // is over — the day it belongs to ended an hour ago.
  it("lets the evening go six hours after it started", () => {
    const evening = event("2026-09-03T16:00:00.000Z");

    expect(isEventOpenForSeating(evening, at("2026-09-03T22:01:00.000Z"))).toBe(false);
  });

  // Yesterday's game is off the screen even when the club opens early: the day is the
  // one on the poster, in Moscow, not the server's.
  it("lets go of a game whose day has passed", () => {
    const afternoon = event("2026-09-03T13:00:00.000Z");

    expect(isEventOpenForSeating(afternoon, at("2026-09-04T08:00:00.000Z"))).toBe(false);
  });

  // The desk may look at Thursday's list on Tuesday, but it seats nobody from it: the
  // tables in front of the admin belong to tonight's tournament.
  it("tells tonight's game apart from the ones still to come", () => {
    const tonight = event("2026-09-03T13:00:00.000Z");
    const thursday = event("2026-09-05T13:00:00.000Z");
    const duringTonight = at("2026-09-03T18:00:00.000Z");

    expect(isEventPlayingToday(tonight, duringTonight)).toBe(true);
    expect(isEventPlayingToday(thursday, duringTonight)).toBe(false);
    // Both are still the desk's business — one to work, one to look at.
    expect(isEventOpenForSeating(thursday, duringTonight)).toBe(true);
  });

  // An evening game is still being played after midnight, and the calendar turning over
  // does not end it.
  it("keeps tonight's game past midnight", () => {
    const evening = event("2026-09-03T17:00:00.000Z");

    expect(isEventPlayingToday(evening, at("2026-09-03T22:00:00.000Z"))).toBe(true);
    expect(isEventPlayingToday(evening, at("2026-09-04T06:00:00.000Z"))).toBe(false);
  });

  // The club plays from seven in the evening until one in the morning, and sometimes
  // later. The desk's six-hour window closes exactly when the last table is still
  // playing, so the players' own screens follow the evening on a longer one.
  it("keeps the evening on the players' board past the desk's window", () => {
    // 19:00 Moscow.
    const evening = event("2026-09-03T16:00:00.000Z");
    const halfPastOne = at("2026-09-03T22:30:00.000Z");

    expect(isEventPlayingToday(evening, halfPastOne)).toBe(false);
    expect(isEventEveningOpen(evening, halfPastOne)).toBe(true);
  });

  it("lets the evening go by the time the club opens again", () => {
    const evening = event("2026-09-03T16:00:00.000Z");

    // 12:00 the next day: still the same evening as far as the board is concerned.
    expect(isEventEveningOpen(evening, at("2026-09-04T09:00:00.000Z"))).toBe(true);
    // 14:00 the next day, and it belongs to the results rather than the board.
    expect(isEventEveningOpen(evening, at("2026-09-04T11:00:00.000Z"))).toBe(false);
  });

  it("is open for a game that has not started", () => {
    const soon = event("2026-09-03T18:00:00.000Z");

    expect(isEventOpenForSeating(soon, at("2026-09-03T12:00:00.000Z"))).toBe(true);
  });
});

describe("holdsTicket", () => {
  it("counts the two statuses that are a ticket", () => {
    expect(holdsTicket("signed_up")).toBe(true);
    expect(holdsTicket("seated")).toBe(true);
  });

  // The screen used to ask "not a queue and not a held ticket?", so every status added
  // later read as a ticket. A no-show whose place went to the queue was the first.
  it("refuses everything that is not one", () => {
    expect(holdsTicket("no_show")).toBe(false);
    expect(holdsTicket("waitlist")).toBe(false);
    expect(holdsTicket("reserved")).toBe(false);
    expect(holdsTicket("cancelled")).toBe(false);
    expect(holdsTicket(null)).toBe(false);
    expect(holdsTicket(undefined)).toBe(false);
  });
});

describe("isCancellationClosed", () => {
  // Stuck on the road with the game under way: saying so frees the seat for the queue.
  it("lets a ticket go back until the desk sits the player down, game or no game", () => {
    expect(isCancellationClosed("signed_up")).toBe(false);
  });

  // A player who busted at ten was still offered "Отменить запись" under the tables.
  // Busting never touches the sign-up, so the mark covers those already out too.
  it("closes it once the player is at a table, or already out", () => {
    expect(isCancellationClosed("seated")).toBe(true);
  });

  // Stepping out of the queue, or turning down a held seat, takes nothing from the room.
  it("leaves everything that is not a ticket open", () => {
    expect(isCancellationClosed("waitlist")).toBe(false);
    expect(isCancellationClosed("reserved")).toBe(false);
    expect(isCancellationClosed("no_show")).toBe(false);
    expect(isCancellationClosed(null)).toBe(false);
  });
});

describe("keepLatestPastEvent", () => {
  const poster = (id: string, startsAt: string, isPublished = true) =>
    mapEventRow({ id, is_published: isPublished, starts_at: startsAt, title: id });

  // Monday 14 September, 15:00 in Moscow.
  const now = new Date("2026-09-14T12:00:00.000Z");
  const deepStack = poster("deep-stack", "2026-09-08T16:00:00.000Z");
  const classic = poster("classic-bounty", "2026-09-10T16:00:00.000Z");
  const freeroll = poster("freeroll", "2026-09-13T16:00:00.000Z");
  const phoenix = poster("phoenix", "2026-09-15T16:00:00.000Z", false);

  it("keeps only the last game played among the ones already over", () => {
    const kept = keepLatestPastEvent([deepStack, classic, freeroll, phoenix], now);

    expect(kept.map((event) => event.id)).toEqual(["freeroll", "phoenix"]);
  });

  it("keeps tonight's game alongside the last finished one", () => {
    const tonight = poster("tonight", "2026-09-14T16:00:00.000Z");

    const kept = keepLatestPastEvent([classic, freeroll, tonight], now);

    expect(kept.map((event) => event.id)).toEqual(["freeroll", "tonight"]);
  });

  // A draft whose date went by was never played, so it is not the last game.
  it("passes over a draft whose date has gone by", () => {
    const staleDraft = poster("stale-draft", "2026-09-13T18:00:00.000Z", false);

    const kept = keepLatestPastEvent([classic, freeroll, staleDraft], now);

    expect(kept.map((event) => event.id)).toEqual(["freeroll"]);
  });

  it("shows every poster still ahead when nothing has been played yet", () => {
    const kept = keepLatestPastEvent([phoenix], now);

    expect(kept).toEqual([phoenix]);
  });
});
