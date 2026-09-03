import { z } from "zod";
import { moscowLocalToUtcISO } from "@/lib/client-bot/schedule-time";
import type { TournamentEvent } from "@/lib/events/types";

// Datetime-local values arrive as Moscow wall time ("2026-09-01T19:00") from both the
// web admin and the mini-app; everything below the API boundary is UTC.
export const eventInputSchema = z.object({
  badge: z.string().trim().max(40).optional().default(""),
  buyIn: z.coerce.number().int().min(0).optional().default(0),
  featuresText: z.string().trim().max(4000).optional().default(""),
  isPublished: z.boolean().optional().default(false),
  lateEntryUntil: z.string().trim().optional().default(""),
  maxPlayers: z.coerce.number().int().positive().nullable().optional().default(null),
  maxVipPlayers: z.coerce.number().int().positive().nullable().optional().default(null),
  posterUrl: z.string().trim().url().or(z.literal("")).optional().default(""),
  rulesText: z.string().trim().max(2000).optional().default(""),
  startingStack: z.coerce.number().int().positive().nullable().optional().default(null),
  startsAt: z.string().trim().min(1, "Укажите дату и время начала"),
  title: z.string().trim().min(1, "Укажите название").max(80),
  venueAddress: z.string().trim().max(200).optional().default(""),
  vipBuyIn: z.coerce.number().int().min(0).nullable().optional().default(null),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export class EventInputError extends Error {}

export function toEventDraft(input: EventInput): Omit<TournamentEvent, "id"> {
  const startsAt = moscowLocalToUtcISO(input.startsAt);
  const lateEntryUntil = input.lateEntryUntil ? moscowLocalToUtcISO(input.lateEntryUntil) : null;

  if (Number.isNaN(new Date(startsAt).getTime())) {
    throw new EventInputError("Не удалось разобрать дату начала");
  }

  if (lateEntryUntil && new Date(lateEntryUntil) < new Date(startsAt)) {
    throw new EventInputError("Поздняя регистрация не может закрываться раньше начала турнира");
  }

  return {
    badge: input.badge || null,
    buyIn: input.buyIn,
    featuresText: input.featuresText,
    isPublished: input.isPublished,
    lateEntryUntil,
    maxPlayers: input.maxPlayers ?? null,
    maxVipPlayers: input.maxVipPlayers ?? null,
    posterUrl: input.posterUrl || null,
    rulesText: input.rulesText,
    startingStack: input.startingStack ?? null,
    startsAt,
    title: input.title,
    venueAddress: input.venueAddress,
    vipBuyIn: input.vipBuyIn ?? null,
  };
}
