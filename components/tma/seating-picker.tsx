"use client";

import { buildSeatingTables, getSeatPosition, type SeatingTable } from "@/lib/tables/seating";
import type { TournamentPlayer } from "@/lib/timer/types";

type SeatingPlayer = Pick<TournamentPlayer, "id" | "name" | "status"> & {
  registrationNumber?: number | null;
  seat?: number | null;
  table?: number | null;
};

type SeatingPickerProps = {
  /** The player being seated: their own chair reads as free, not as taken by them. */
  ignorePlayerId?: string;
  onSelect: (seat: { seat: number; table: number }) => void;
  onTakenSeat: (playerName: string) => void;
  players: SeatingPlayer[];
  selected: { seat: number; table: number } | null;
  tablesCount: number;
};

/**
 * The room, drawn the way it stands: a table per oval, ten seats each, the VIP table
 * marked in the middle. The admin taps the chair the player is going to.
 */
export function SeatingPicker({
  ignorePlayerId,
  onSelect,
  onTakenSeat,
  players,
  selected,
  tablesCount,
}: SeatingPickerProps) {
  const tables = buildSeatingTables(
    ignorePlayerId ? players.filter((player) => player.id !== ignorePlayerId) : players,
    tablesCount,
  );

  return (
    <div className="seating-picker">
      {tables.map((table) => (
        <SeatingTableView
          key={table.number}
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
  onSelect,
  onTakenSeat,
  selected,
  table,
}: {
  onSelect: SeatingPickerProps["onSelect"];
  onTakenSeat: SeatingPickerProps["onTakenSeat"];
  selected: SeatingPickerProps["selected"];
  table: SeatingTable;
}) {
  return (
    <div className="seating-table">
      <div className="seating-table__felt">
        {table.isVip ? <span className="seating-table__vip">VIP</span> : null}
      </div>

      {table.seats.map((seat, index) => {
        const position = getSeatPosition(index, table.seats.length);
        const isSelected = selected?.table === table.number && selected.seat === seat.seat;
        const taken = seat.player !== null;

        return (
          <button
            key={seat.seat}
            aria-label={
              taken
                ? `Стол ${table.number}, место ${seat.seat}: ${seat.player?.name}`
                : `Стол ${table.number}, место ${seat.seat}, свободно`
            }
            className={[
              "seating-seat",
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
            {seat.seat}
          </button>
        );
      })}
    </div>
  );
}
