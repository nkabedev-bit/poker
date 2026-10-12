/**
 * The club sends a team to the Russian club championship in Sochi (16–19 November 2026),
 * and its four players are picked by the rating the club's games build up until then.
 * Every poster up to and including 10 November says so beside its own plate.
 */
export const SOCHI_QUALIFIER_LABEL = "Отбор в Сочи";

// A game on 10 November may run past midnight, so the start is what decides.
const SOCHI_QUALIFIER_UNTIL = Date.parse("2026-11-11T00:00:00+03:00");

export function isSochiQualifier(startsAt: string) {
  return new Date(startsAt).getTime() < SOCHI_QUALIFIER_UNTIL;
}
