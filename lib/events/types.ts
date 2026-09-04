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

export type EventSignupStatus = "signed_up" | "cancelled" | "seated";

export type EventSignup = {
  createdAt: string;
  /** When the invited member said yes; a guest's pair is settled the moment it is made. */
  duoConfirmedAt: string | null;
  /** On the +1's row: the player who bought the ticket for the two of them. */
  duoHostTelegramId: number | null;
  /** On the buyer's row: the guest they are bringing, when the +1 has no account. */
  duoPartnerName: string | null;
  /** On the buyer's row: the member they invited, when the +1 plays at the club. */
  duoPartnerTelegramId: number | null;
  eventId: string;
  id: string;
  status: EventSignupStatus;
  telegramId: number;
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
    duoHostTelegramId: optionalTelegramId(row.duo_host_telegram_id),
    duoPartnerName: optionalText(row.duo_partner_name),
    duoPartnerTelegramId: optionalTelegramId(row.duo_partner_telegram_id),
    eventId: String(row.event_id),
    id: String(row.id),
    status: (row.status as EventSignupStatus) ?? "signed_up",
    telegramId: Number(row.telegram_id),
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
export function isUpcomingEvent(event: TournamentEvent, now: Date) {
  const deadline = new Date(event.lateEntryUntil ?? event.startsAt);
  return deadline.getTime() >= now.getTime();
}
