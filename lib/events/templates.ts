import { moscowLocalToUtcISO, utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";
import type { TournamentEvent } from "@/lib/events/types";

const MAX_EVENT_TEMPLATES = 20;
const MAX_NAME_LENGTH = 48;

/**
 * A poster with the date taken out.
 *
 * The club runs the same seven tournaments over and over: the same title, prices,
 * rules and artwork, and only the evening changes. A template holds everything but the
 * evening, so making next week's poster is picking one and typing a date.
 */
export type EventTemplate = {
  badge: string | null;
  buyIn: number;
  featuresText: string;
  id: string;
  /** How long after the start late registration stays open, in minutes. */
  lateEntryMinutes: number | null;
  maxPlayers: number | null;
  maxVipPlayers: number | null;
  name: string;
  posterUrl: string | null;
  rulesText: string;
  startingStack: number | null;
  title: string;
  venueAddress: string;
  vipBuyIn: number | null;
};

export type EventDraft = Omit<TournamentEvent, "id">;

function normalizeTemplateName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
}

/** Late registration is remembered as a distance from the start, not as a moment. */
function toLateEntryMinutes(event: Pick<EventDraft, "lateEntryUntil" | "startsAt">) {
  if (!event.lateEntryUntil) return null;

  const minutes = Math.round(
    (new Date(event.lateEntryUntil).getTime() - new Date(event.startsAt).getTime()) / 60000,
  );

  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function makeEventTemplate(
  name: string,
  event: EventDraft,
  id = crypto.randomUUID(),
): EventTemplate {
  return {
    badge: event.badge,
    buyIn: event.buyIn,
    featuresText: event.featuresText,
    id,
    lateEntryMinutes: toLateEntryMinutes(event),
    maxPlayers: event.maxPlayers,
    maxVipPlayers: event.maxVipPlayers,
    name: normalizeTemplateName(name),
    posterUrl: event.posterUrl,
    rulesText: event.rulesText,
    startingStack: event.startingStack,
    title: event.title,
    venueAddress: event.venueAddress,
    vipBuyIn: event.vipBuyIn,
  };
}

/** Saving under a name that already exists replaces it, so a template can be corrected. */
export function upsertEventTemplate(templates: EventTemplate[], template: EventTemplate) {
  const name = template.name.toLocaleLowerCase("ru-RU");
  const rest = templates.filter((item) => item.name.toLocaleLowerCase("ru-RU") !== name);

  return [template, ...rest].slice(0, MAX_EVENT_TEMPLATES);
}

export function removeEventTemplate(templates: EventTemplate[], id: string) {
  return templates.filter((item) => item.id !== id);
}

/**
 * The poster a template makes for one evening. Everything comes from the template; the
 * date is the admin's, and late registration is measured from it.
 */
export function applyEventTemplate(
  template: EventTemplate,
  { startsAt }: { startsAt: string },
): EventDraft {
  const lateEntryUntil = template.lateEntryMinutes
    ? new Date(new Date(startsAt).getTime() + template.lateEntryMinutes * 60000).toISOString()
    : null;

  return {
    badge: template.badge,
    buyIn: template.buyIn,
    featuresText: template.featuresText,
    isPublished: false,
    lateEntryUntil,
    maxPlayers: template.maxPlayers,
    maxVipPlayers: template.maxVipPlayers,
    posterUrl: template.posterUrl,
    rulesText: template.rulesText,
    startingStack: template.startingStack,
    startsAt,
    title: template.title,
    venueAddress: template.venueAddress,
    vipBuyIn: template.vipBuyIn,
  };
}

export function isEventTemplate(value: unknown): value is EventTemplate {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;

  return typeof item.id === "string" && typeof item.name === "string";
}

/**
 * Moves a Moscow wall-time value forward, which is how a template's late registration
 * follows the start the admin typed into the form.
 */
export function addMinutesToMoscowLocal(local: string, minutes: number) {
  const startsAt = new Date(moscowLocalToUtcISO(local));
  if (Number.isNaN(startsAt.getTime())) return local;

  return utcISOToMoscowLocal(new Date(startsAt.getTime() + minutes * 60000).toISOString());
}
