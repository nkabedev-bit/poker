const MOSCOW_TIME_ZONE = "Europe/Moscow";

export type TournamentEvent = {
  badge: string | null;
  buyIn: number;
  /** What a "1+1" ticket costs for the two of them together. */
  duoBuyIn: number | null;
  featuresText: string;
  id: string;
  isPublished: boolean;
  lateEntryUntil: string | null;
  /** How many "1+1" tickets the club sells tonight; null means it sells none. */
  maxDuoTickets: number | null;
  /** Seats at the regular tables. */
  maxPlayers: number | null;
  /** Seats at the VIP table, counted apart from the regular ones. */
  maxVipPlayers: number | null;
  posterUrl: string | null;
  rulesText: string;
  startingStack: number | null;
  startsAt: string;
  title: string;
  venueAddress: string;
  vipBuyIn: number | null;
};

export type EventSignupStatus =
  | "signed_up"
  | "cancelled"
  | "seated"
  | "waitlist"
  /** Signed up, never came, and their place went to somebody from the queue. */
  | "no_show"
  | "reserved";

/**
 * The statuses that take a seat.
 *
 * Standing in line is not one of them: the whole point of the queue is that the room is
 * already full, and counting it would make the poster look fuller still. Neither is a
 * no-show — their place was given away to the queue, and counting it twice would close
 * the poster on a seat somebody is already sitting in.
 */
export const SEAT_TAKING_STATUSES = ["signed_up", "seated", "reserved"] as const;

export type EventSignup = {
  createdAt: string;
  /** When the invited member said yes; a guest's pair is settled the moment it is made. */
  duoConfirmedAt: string | null;
  /** On the +1's row: the account that bought the ticket for the two of them. */
  duoHostUserId: string | null;
  /** On the buyer's row: the guest they are bringing, when the +1 has no account. */
  duoPartnerName: string | null;
  /** On the buyer's row: the member they invited, when the +1 plays at the club. */
  duoPartnerUserId: string | null;
  /** The link's pass, while the buyer is waiting for somebody new to open it. */
  duoInviteToken: string | null;
  /** When the club told this player their ticket was waiting; null until the poster is up. */
  notifiedAt: string | null;
  eventId: string;
  id: string;
  status: EventSignupStatus;
  /** Null on a sign-up made from the web: those players have no Telegram at all. */
  telegramId: number | null;
  /** Whose sign-up this is, whichever door they came through. */
  userId: string;
  /** The ticket the player asked for; it decides which seat they are counted against. */
  ticketType: EventTicketType;
  /** Which free entry the player asked to pay with; spent only when they are seated. */
  usePass: FreePassChoice;
};

/**
 * A "1+1" is two rows of one ticket: `duo` is the player who paid for both, and
 * `duo_plus_one` is the member who came on their invitation. Only the first is counted
 * against the poster's allotment — the seat of the second is inside the same ticket.
 */
export type EventTicketType = "regular" | "vip" | "duo" | "duo_plus_one";

export type FreePassChoice = "none" | "regular" | "vip";

/**
 * The tickets the club can hold for somebody who asked ahead. A "1+1" is one of them:
 * the seat is promised, and who fills its second half is the player's to say when they
 * confirm.
 */
export type ReservableTicket = "regular" | "vip" | "duo";

export function isReservableTicket(value: unknown): value is ReservableTicket {
  return value === "regular" || value === "vip" || value === "duo";
}

export function isEventTicketType(value: unknown): value is EventTicketType {
  return (
    value === "regular" || value === "vip" || value === "duo" || value === "duo_plus_one"
  );
}

/** Both halves of a "1+1", as against a ticket bought for one player. */
export function isDuoTicket(ticket: EventTicketType) {
  return ticket === "duo" || ticket === "duo_plus_one";
}

export function isFreePassChoice(value: unknown): value is FreePassChoice {
  return value === "none" || value === "regular" || value === "vip";
}

/**
 * A free entry covers the ticket of its own kind and nothing else: a regular pass never
 * opens a VIP seat, and a VIP pass is not spent on a regular one.
 */
export function passMatchesTicket(pass: FreePassChoice, ticket: EventTicketType) {
  return pass === "none" || pass === ticket;
}

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

/** Zero is a real answer here: the club runs this one without a VIP table. */
function optionalSeatCount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function optionalTelegramId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** A price the poster may leave unset — zero is a freeroll, not "no such ticket". */
function optionalPrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const price = Number(value);
  return Number.isFinite(price) ? Math.max(0, price) : null;
}

function optionalPositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function mapEventRow(row: Record<string, unknown>): TournamentEvent {
  return {
    badge: optionalText(row.badge),
    buyIn: Math.max(0, Number(row.buy_in) || 0),
    duoBuyIn: optionalPrice(row.duo_buy_in),
    featuresText: String(row.features_text ?? ""),
    id: String(row.id),
    isPublished: Boolean(row.is_published),
    lateEntryUntil: optionalText(row.late_entry_until),
    // Zero is a real answer: the poster keeps the price but sells no pair tonight.
    maxDuoTickets: optionalSeatCount(row.max_duo_tickets),
    maxPlayers: optionalPositiveInt(row.max_players),
    maxVipPlayers: optionalSeatCount(row.max_vip_players),
    posterUrl: optionalText(row.poster_url),
    rulesText: String(row.rules_text ?? ""),
    startingStack: optionalPositiveInt(row.starting_stack),
    startsAt: String(row.starts_at),
    title: String(row.title ?? ""),
    venueAddress: String(row.venue_address ?? ""),
    vipBuyIn: optionalPrice(row.vip_buy_in),
  };
}

export function mapSignupRow(row: Record<string, unknown>): EventSignup {
  return {
    createdAt: String(row.created_at),
    duoConfirmedAt: optionalText(row.duo_confirmed_at),
    duoHostUserId: optionalText(row.duo_host_user_id),
    duoPartnerName: optionalText(row.duo_partner_name),
    duoInviteToken: optionalText(row.duo_invite_token),
    notifiedAt: optionalText(row.notified_at),
    duoPartnerUserId: optionalText(row.duo_partner_user_id),
    eventId: String(row.event_id),
    id: String(row.id),
    status: (row.status as EventSignupStatus) ?? "signed_up",
    telegramId: optionalTelegramId(row.telegram_id),
    userId: String(row.user_id),
    ticketType: isEventTicketType(row.ticket_type) ? row.ticket_type : "regular",
    usePass: isFreePassChoice(row.use_pass) ? row.use_pass : "none",
  };
}

export function toEventRow(event: Omit<TournamentEvent, "id">) {
  return {
    badge: event.badge,
    buy_in: event.buyIn,
    duo_buy_in: event.duoBuyIn,
    features_text: event.featuresText,
    is_published: event.isPublished,
    late_entry_until: event.lateEntryUntil,
    max_duo_tickets: event.maxDuoTickets,
    max_players: event.maxPlayers,
    max_vip_players: event.maxVipPlayers,
    poster_url: event.posterUrl,
    rules_text: event.rulesText,
    starting_stack: event.startingStack,
    starts_at: event.startsAt,
    title: event.title,
    venue_address: event.venueAddress,
    vip_buy_in: event.vipBuyIn,
  };
}

// The club lives in Moscow and the posters quote Moscow wall time, so every label is
// rendered in that zone regardless of where the server (or the player) sits.
export function formatEventDayLabel(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: MOSCOW_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatEventTimeLabel(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MOSCOW_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatEventWeekdayLabel(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    timeZone: MOSCOW_TIME_ZONE,
  }).format(new Date(iso));
}

// An event stays "upcoming" until late entry closes (or, without a late-entry time,
// until it starts) — a player arriving at 21:00 for a 19:00 game still needs the card.
/**
 * How long the desk keeps seating players after midnight has passed.
 *
 * An evening game is still being played in the small hours, and the calendar turning
 * over is no reason to take its list off the screen.
 */
const SEATING_HOURS_AFTER_START = 6;

const moscowDayFormat = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: MOSCOW_TIME_ZONE,
  year: "numeric",
});

/** The club's day, which is the one on the posters: Moscow, whatever the server thinks. */
function moscowDay(time: Date) {
  return moscowDayFormat.format(time);
}

/**
 * Whether this is the evening being played — the one whose players are sat down now.
 *
 * The club counts by the day, not by the clock: a game announced for four o'clock is
 * the evening's game until that day is over, and a player who turns up at half past
 * five — or at eleven — is seated from the same list.
 */
export function isEventPlayingToday(event: TournamentEvent, now: Date) {
  const started = new Date(event.startsAt);
  if (moscowDay(started) === moscowDay(now)) return true;

  // Past midnight the day no longer matches, and the game is still going. Only ever
  // forwards: an evening still to come has not begun.
  const since = now.getTime() - started.getTime();
  return since >= 0 && since < SEATING_HOURS_AFTER_START * 60 * 60 * 1000;
}

/**
 * Whether the desk should still be working this event: tonight's game, and every poster
 * still ahead of it.
 *
 * Late entry closing means the club takes no more sign-ups — not that the evening is
 * over. Everyone who asked in time still has to be let in and sat down.
 */
export function isEventOpenForSeating(event: TournamentEvent, now: Date) {
  return isUpcomingEvent(event, now) || isEventPlayingToday(event, now);
}

export function isUpcomingEvent(event: TournamentEvent, now: Date) {
  const deadline = new Date(event.lateEntryUntil ?? event.startsAt);
  return deadline.getTime() >= now.getTime();
}
