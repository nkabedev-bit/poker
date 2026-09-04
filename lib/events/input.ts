import { z } from "zod";
import { moscowLocalToUtcISO } from "@/lib/client-bot/schedule-time";
import type { TournamentEvent } from "@/lib/events/types";

// Datetime-local values arrive as Moscow wall time ("2026-09-01T19:00") from both the
// web admin and the mini-app; everything below the API boundary is UTC.
export const eventInputSchema = z.object({
  badge: z.string().trim().max(40).optional().default(""),
  buyIn: z.coerce.number().int().min(0).optional().default(0),
  // The price of a "1+1" is what the pair pays together, and the club splits it in half
  // on the night — an odd sum would leave the till a rouble short of the two receipts.
  duoBuyIn: z.coerce
    .number()
    .int()
    .min(0)
    .refine((price) => price % 2 === 0, "Цена билета 1+1 делится пополам — укажите чётную сумму")
    .nullable()
    .optional()
    .default(null),
  featuresText: z.string().trim().max(4000).optional().default(""),
  isPublished: z.boolean().optional().default(false),
  lateEntryUntil: z.string().trim().optional().default(""),
  // Zero means the club sells no pair tonight, so it has to survive the form.
  maxDuoTickets: z.coerce.number().int().min(0).nullable().optional().default(null),
  maxPlayers: z.coerce.number().int().positive().nullable().optional().default(null),
  // Zero means the club opens no VIP table for this one, so it has to survive the form.
  maxVipPlayers: z.coerce.number().int().min(0).nullable().optional().default(null),
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
    duoBuyIn: input.duoBuyIn ?? null,
    featuresText: input.featuresText,
    isPublished: input.isPublished,
    lateEntryUntil,
    maxDuoTickets: input.maxDuoTickets ?? null,
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
