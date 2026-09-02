const MOSCOW_TIME_ZONE = "Europe/Moscow";

export type TournamentEvent = {
  badge: string | null;
  buyIn: number;
  featuresText: string;
  id: string;
  isPublished: boolean;
  lateEntryUntil: string | null;
  maxPlayers: number | null;
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
  eventId: string;
  id: string;
  status: EventSignupStatus;
  telegramId: number;
  /** Which free entry the player asked to pay with; spent only when they are seated. */
  usePass: FreePassChoice;
};

export type FreePassChoice = "none" | "regular" | "vip";

export function isFreePassChoice(value: unknown): value is FreePassChoice {
  return value === "none" || value === "regular" || value === "vip";
}

function optionalText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function optionalPositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function mapEventRow(row: Record<string, unknown>): TournamentEvent {
  return {
    badge: optionalText(row.badge),
    buyIn: Math.max(0, Number(row.buy_in) || 0),
    featuresText: String(row.features_text ?? ""),
    id: String(row.id),
    isPublished: Boolean(row.is_published),
    lateEntryUntil: optionalText(row.late_entry_until),
    maxPlayers: optionalPositiveInt(row.max_players),
    posterUrl: optionalText(row.poster_url),
    rulesText: String(row.rules_text ?? ""),
    startingStack: optionalPositiveInt(row.starting_stack),
    startsAt: String(row.starts_at),
    title: String(row.title ?? ""),
    venueAddress: String(row.venue_address ?? ""),
    vipBuyIn: Number.isFinite(Number(row.vip_buy_in)) && row.vip_buy_in !== null
      ? Math.max(0, Number(row.vip_buy_in))
      : null,
  };
}

export function mapSignupRow(row: Record<string, unknown>): EventSignup {
  return {
    createdAt: String(row.created_at),
    eventId: String(row.event_id),
    id: String(row.id),
    status: (row.status as EventSignupStatus) ?? "signed_up",
    telegramId: Number(row.telegram_id),
    usePass: isFreePassChoice(row.use_pass) ? row.use_pass : "none",
  };
}

export function toEventRow(event: Omit<TournamentEvent, "id">) {
  return {
    badge: event.badge,
    buy_in: event.buyIn,
    features_text: event.featuresText,
    is_published: event.isPublished,
    late_entry_until: event.lateEntryUntil,
    max_players: event.maxPlayers,
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
