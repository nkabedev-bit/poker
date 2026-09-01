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
  const playerReentries = Math.max(0, Number(player.rebuys ?? 0));
  const maxReentries = Math.max(1, Number(settings.maxReentries ?? 1));

  // Wanted Bounty: re-entries are unlimited while the re-entry window is open (the
  // reentryCloses level flag still ends the window as usual).
  const usesReentry =
    requestedReentry &&
    settings.reentryEnabled &&
    (isWantedBounty || playerReentries < maxReentries) &&
    isReentryAvailable(timerState, blindLevels, now);

  const currentTimerState = getEffectiveTimerState(timerState, blindLevels, now);
  // PHOENIX / DEEP STACK formats allow regular re-entries only — the double (x2)
  // option is refused even when the blind level carries the x2 flag. In Wanted Bounty
  // the double re-entry is a once-per-player option on top of that.
  const reentryDouble =
    usesReentry &&
    requestedDouble &&
    (settings.tournamentFormat ?? "regular") === "regular" &&
    (!isWantedBounty || Math.max(0, Number(player.doubleRebuys ?? 0)) === 0) &&
    Boolean(blindLevels[currentTimerState.currentLevelIndex]?.doubleReentryAvailable);

  return { reentryDouble, usesReentry };
}
