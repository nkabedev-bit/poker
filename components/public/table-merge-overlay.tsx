import { formatTableMoveTarget, TABLE_MERGE_NOTICE } from "@/lib/timer/table-merge";
import type { TableMerge } from "@/lib/timer/types";

/** Past this many lines the list goes into two columns, so a full table fits the board. */
const ONE_COLUMN_MOVES = 5;

/**
 * The floor's own announcement while a table is being broken up.
 *
 * The room is told to finish the hand and move. When the app did the reseating, the
 * board also says who goes where — table by table, seat by seat — so nobody has to queue
 * at the desk to find their new chair.
 */
export function TableMergeOverlay({ clock, merge }: { clock: string; merge: TableMerge }) {
  const moves = merge.moves ?? [];
  const listed = moves.length > 0;
  const twoColumns = moves.length > ONE_COLUMN_MOVES;

  return (
    <div
      className={`public-break-overlay public-break-overlay--merge${
        listed ? " public-break-overlay--moves" : ""
      }`}
      role="status"
    >
      <span className="public-break-overlay__label">{TABLE_MERGE_NOTICE.label}</span>
      <strong className="public-break-overlay__notice">{TABLE_MERGE_NOTICE.title}</strong>
      <span className="public-break-overlay__detail">{TABLE_MERGE_NOTICE.detail}</span>
      {listed ? (
        <ul
          className={`public-break-overlay__moves${
            twoColumns ? " public-break-overlay__moves--two" : ""
          }`}
          // Filled column by column, so the grid has to know how tall a column is.
          style={
            twoColumns
              ? { gridTemplateRows: `repeat(${Math.ceil(moves.length / 2)}, auto)` }
              : undefined
          }
        >
          {moves.map((move) => (
            <li className="public-break-overlay__move" key={move.playerId}>
              <span className="public-break-overlay__move-name">{move.name}</span>
              {" пересаживается за "}
              <span className="public-break-overlay__move-target">
                {formatTableMoveTarget(move)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <span className="public-break-overlay__clock">{clock}</span>
    </div>
  );
}
