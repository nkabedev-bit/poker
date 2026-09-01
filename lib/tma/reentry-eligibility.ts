import { getEffectiveTimerState, isReentryAvailable } from "@/lib/timer/calculate";
import type { BlindLevel, TimerState, TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

export type ReentryEligibility = {
  reentryDouble: boolean;
  usesReentry: boolean;
};

/**
 * Decides whether a requested re-entry (and its x2 variant) may actually be recorded.
 * Shared by the elimination flow and by restoring an eliminated player as a re-entry,
 * so both paths obey the same rules: the re-entry window, the per-player limit, the
 * PHOENIX / DEEP STACK format ban on doubles, and the once-per-player double in
 * Wanted Bounty.
 */
// PHOENIX and DEEP STACK are single-bullet formats: the x2 entry is off regardless of
// the blind level flag.
export function isDoubleReentryBannedByFormat(format: TournamentExtras["settings"]["tournamentFormat"]) {
  return format === "phoenix" || format === "deepstack";
}

export function resolveReentryEligibility({
  blindLevels,
  now,
  player,
  requestedDouble,
  requestedReentry,
  settings,
  timerState,
}: {
  blindLevels: BlindLevel[];
  now: Date;
  player: Pick<TournamentPlayer, "doubleRebuys" | "rebuys">;
  requestedDouble: boolean;
  requestedReentry: boolean;
  settings: TournamentExtras["settings"];
  timerState: TimerState;
}): ReentryEligibility {
  const isWantedBounty = settings.bountyType === "wanted";
  // Progressive Bounty runs the same unlimited re-entry rule as Wanted: a player may
  // rebuy as long as the window is open, and each new bullet starts a fresh head.
  const isUnlimitedReentry = isWantedBounty || settings.bountyType === "progressive";
  const playerReentries = Math.max(0, Number(player.rebuys ?? 0));
  const maxReentries = Math.max(1, Number(settings.maxReentries ?? 1));

  // Wanted / Progressive Bounty: re-entries are unlimited while the re-entry window is
  // open (the reentryCloses level flag still ends the window as usual).
  const usesReentry =
    requestedReentry &&
    settings.reentryEnabled &&
    (isUnlimitedReentry || playerReentries < maxReentries) &&
    isReentryAvailable(timerState, blindLevels, now);

  const currentTimerState = getEffectiveTimerState(timerState, blindLevels, now);
  // PHOENIX / DEEP STACK formats allow regular re-entries only — the double (x2)
  // option is refused even when the blind level carries the x2 flag. Every other format
  // (including FREEROLL) keeps it. In Wanted Bounty the double re-entry is a
  // once-per-player option on top of that.
  const reentryDouble =
    usesReentry &&
    requestedDouble &&
    !isDoubleReentryBannedByFormat(settings.tournamentFormat) &&
    (!isWantedBounty || Math.max(0, Number(player.doubleRebuys ?? 0)) === 0) &&
    Boolean(blindLevels[currentTimerState.currentLevelIndex]?.doubleReentryAvailable);

  return { reentryDouble, usesReentry };
}
