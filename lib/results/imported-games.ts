/**
 * Games imported from the club's sheets have a date but no start time. They are stored at
 * midday UTC of their day: the date stays right in Moscow, and the time reads as unknown —
 * a game the app ran starts at the moment its timer did, never exactly on that mark.
 */
const IMPORTED_START_SUFFIX = "T12:00:00.000Z";

/** The start an imported game is stored with. */
export function importedGameStart(playedOn: string) {
  return `${playedOn}${IMPORTED_START_SUFFIX}`;
}

/** Whether the game's start time is known — it is not for a game imported from the sheets. */
export function hasKnownStartTime(startedAt: string) {
  const moment = new Date(startedAt);
  if (Number.isNaN(moment.getTime())) return false;

  return !moment.toISOString().endsWith(IMPORTED_START_SUFFIX);
}
