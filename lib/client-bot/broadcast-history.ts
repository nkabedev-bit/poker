export type BroadcastHistoryRow = { id: string; send_at: string; status: string };

/** How many finished broadcasts the history keeps; the rest are forgotten. */
export const KEPT_FINISHED_BROADCASTS = 2;

/** A broadcast that has already happened, one way or another. */
export function isFinishedBroadcast(status: string) {
  return status !== "pending" && status !== "sending";
}

function newestFirst<T extends BroadcastHistoryRow>(rows: T[]) {
  return [...rows].sort((a, b) => b.send_at.localeCompare(a.send_at));
}

/**
 * The history as the admin should see it: everything still waiting to go out, and the
 * last couple of broadcasts that already went.
 *
 * A queued broadcast is never hidden — losing sight of one the club scheduled would be
 * worse than a long list.
 */
export function selectVisibleBroadcasts<T extends BroadcastHistoryRow>(
  rows: T[],
  keep = KEPT_FINISHED_BROADCASTS,
) {
  const sorted = newestFirst(rows);
  const waiting = sorted.filter((row) => !isFinishedBroadcast(row.status));
  const finished = sorted.filter((row) => isFinishedBroadcast(row.status)).slice(0, keep);

  return [...waiting, ...finished];
}

/** Ids of the finished broadcasts past the ones worth keeping. */
export function selectBroadcastsToForget<T extends BroadcastHistoryRow>(
  rows: T[],
  keep = KEPT_FINISHED_BROADCASTS,
) {
  return newestFirst(rows)
    .filter((row) => isFinishedBroadcast(row.status))
    .slice(keep)
    .map((row) => row.id);
}
