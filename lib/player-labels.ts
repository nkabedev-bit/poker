// Persistent per-guest display labels (e.g. "дилер") keyed by nickname so a regular
// guest keeps their marker across games, even though the player roster is wiped when a
// tournament finishes. The store lives on TournamentExtras.playerLabels.

import type { SupabaseClient } from "@supabase/supabase-js";

/** The stored labels, read from the current tournament's extras; empty when there is none. */
export async function readStoredPlayerLabels(
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!tournament) return {};

  const { data: extras, error: extrasError } = await supabase
    .from("tournament_extras")
    .select("data")
    .eq("tournament_id", tournament.id)
    .maybeSingle();
  if (extrasError) throw extrasError;

  const labels = (extras?.data as { playerLabels?: unknown } | null)?.playerLabels;
  return labels && typeof labels === "object" && !Array.isArray(labels)
    ? (labels as Record<string, string>)
    : {};
}

export function normalizePlayerLabelKey(name: string | null | undefined): string {
  return String(name ?? "").trim().toLowerCase();
}

// Labels that mark a player as the dealer: rendered as the "D" button on the public
// screen and award knockout points in Dealer Revenge mode.
const DEALER_LABELS = new Set(["дилер", "dealer", "d"]);

export function isDealerLabel(label: string | null | undefined): boolean {
  return DEALER_LABELS.has(String(label ?? "").trim().toLowerCase());
}

export function getPersistedPlayerLabel(
  playerLabels: Record<string, string> | undefined | null,
  name: string | null | undefined,
): string | null {
  if (!playerLabels) return null;
  const key = normalizePlayerLabelKey(name);
  if (!key) return null;
  const value = playerLabels[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function setPersistedPlayerLabel(
  playerLabels: Record<string, string> | undefined | null,
  name: string,
  label: string,
): Record<string, string> {
  const next = { ...(playerLabels ?? {}) };
  next[normalizePlayerLabelKey(name)] = label;
  return next;
}

export function removePersistedPlayerLabel(
  playerLabels: Record<string, string> | undefined | null,
  name: string,
): Record<string, string> {
  const next = { ...(playerLabels ?? {}) };
  delete next[normalizePlayerLabelKey(name)];
  return next;
}
