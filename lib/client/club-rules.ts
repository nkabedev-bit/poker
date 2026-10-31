/** The club's rules, served as they were handed over: a PDF in `public/rules`. */
export const CLUB_RULES_URL = "/rules/majestic-rules.pdf";

/**
 * When the rules were last changed. A player who agreed before this is asked again:
 * bump it together with the PDF, and everybody sees the reminder on their next visit.
 */
export const CLUB_RULES_UPDATED_AT = "2026-10-31T00:00:00+03:00";

/** Whether the player's agreement covers the rules as they stand now. */
export function hasAcceptedCurrentRules(acceptedAt: string | null) {
  if (!acceptedAt) return false;

  const accepted = new Date(acceptedAt).getTime();
  return Number.isFinite(accepted) && accepted >= new Date(CLUB_RULES_UPDATED_AT).getTime();
}
