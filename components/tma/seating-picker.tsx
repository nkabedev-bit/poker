"use client";

import {
  buildSeatingTables,
  getSeatPosition,
  nextTableFormat,
  previousTableFormat,
  type SeatingPlayer,
  type SeatingTable,
} from "@/lib/tables/seating";

type SeatingPickerProps = {
  /** The table whose chairs are being changed right now; its buttons wait meanwhile. */
  changingTable?: number | null;
  /** The player being seated: their own chair reads as free, not as taken by them. */
  ignorePlayerId?: string;
  /** Brings a chair to a table or takes one away; without it the plan only picks chairs. */
  onChangeTableFormat?: (table: number, direction: "add" | "remove") => void;
  onSelect: (seat: { seat: number; table: number }) => void;
  onTakenSeat: (playerName: string) => void;
  players: SeatingPlayer[];
  selected: { seat: number; table: number } | null;
  /** The format every table is dealt in tonight, or each table's own. */
  tableFormats?: number | readonly number[] | null;
  tablesCount: number;
};

/**
 * The room, drawn the way it stands: a table per oval with the chairs the club has put at
 * it, the VIP table marked in the middle. The admin taps the chair the player is going to,
 * and can bring a chair to a table when the late ones arrive.
 */
export function SeatingPicker({
  changingTable = null,
  ignorePlayerId,
  onChangeTableFormat,
  onSelect,
  onTakenSeat,
  players,
  selected,
  tableFormats,
  tablesCount,
}: SeatingPickerProps) {
  const tables = buildSeatingTables(
    ignorePlayerId ? players.filter((player) => player.id !== ignorePlayerId) : players,
    tablesCount,
    tableFormats,
  );

  return (
    <div className="seating-picker">
      {tables.map((table) => (
        <SeatingTableView
          key={table.number}
          changing={changingTable === table.number}
          onChangeTableFormat={onChangeTableFormat}
          onSelect={onSelect}
          onTakenSeat={onTakenSeat}
          selected={selected}
          table={table}
        />
      ))}
    </div>
  );
}

function SeatingTableView({
  changing,
  onChangeTableFormat,
  onSelect,
  onTakenSeat,
  selected,
  table,
}: {
  changing: boolean;
  onChangeTableFormat: SeatingPickerProps["onChangeTableFormat"];
  onSelect: SeatingPickerProps["onSelect"];
  onTakenSeat: SeatingPickerProps["onTakenSeat"];
  selected: SeatingPickerProps["selected"];
  table: SeatingTable;
}) {
  return (
    <div className="seating-table-block">
      <div className="seating-table__header">
        <span>
          Стол {table.number} · {table.format} макс
        </span>
        {onChangeTableFormat ? (
          <span className="seating-table__actions">
            <button
              aria-label={`Убрать место за столом ${table.number}`}
              disabled={changing || previousTableFormat(table.format) === null}
              type="button"
              onClick={() => onChangeTableFormat(table.number, "remove")}
            >
              − место
            </button>
            <button
              aria-label={`Добавить место за столом ${table.number}`}
              disabled={changing || nextTableFormat(table.format) === null}
              type="button"
              onClick={() => onChangeTableFormat(table.number, "add")}
            >
              + место
            </button>
          </span>
        ) : null}
      </div>

      <div className="seating-table">
        <div className="seating-table__felt">
          {table.isVip ? <span className="seating-table__vip">VIP</span> : null}
        </div>

        {table.seats.map((seat) => {
          const position = getSeatPosition(seat);
          const isSelected = selected?.table === table.number && selected.seat === seat.seat;
          const taken = seat.player !== null;

          return (
            <button
              key={seat.seat}
              aria-label={
                taken
                  ? `Стол ${table.number}, место ${seat.label}: ${seat.player?.name}`
                  : `Стол ${table.number}, место ${seat.label}, свободно`
              }
              className={[
                "seating-seat",
                seat.label.includes("/") ? "seating-seat--between" : "",
                taken ? "seating-seat--taken" : "",
                isSelected ? "seating-seat--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ left: `${position.left}%`, top: `${position.top}%` }}
              type="button"
              onClick={() =>
                taken
                  ? onTakenSeat(seat.player?.name ?? "")
                  : onSelect({ seat: seat.seat, table: table.number })
              }
            >
              {seat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
