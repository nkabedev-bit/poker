/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TableMergeOverlay } from "@/components/public/table-merge-overlay";
import { describeTableMove, TABLE_MERGE_NOTICE } from "@/lib/timer/table-merge";
import type { TableMove } from "@/lib/timer/types";

afterEach(() => cleanup());

function move(name: string, table: number, seat: number, seatLabel = String(seat)): TableMove {
  return { name, playerId: name, seat, seatLabel, table };
}

const STARTED_AT = "2026-09-27T20:00:00.000Z";

describe("TableMergeOverlay", () => {
  it("reads out who goes where under the announcement", () => {
    const moves = [move("Chura", 1, 3), move("Олюшка", 2, 5, "5")];
    render(<TableMergeOverlay clock="12:30" merge={{ brokenTable: 3, moves, startedAt: STARTED_AT }} />);

    expect(screen.getByText(TABLE_MERGE_NOTICE.title)).toBeTruthy();
    expect(screen.getByText(TABLE_MERGE_NOTICE.detail)).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      moves.map(describeTableMove),
    );
    expect(screen.getByText("12:30")).toBeTruthy();
  });

  it("names a short-handed chair by both of its places", () => {
    render(
      <TableMergeOverlay
        clock="12:30"
        merge={{ moves: [move("Vera", 1, 2, "2/3")], startedAt: STARTED_AT }}
      />,
    );

    expect(screen.getByRole("listitem").textContent).toBe("Vera пересаживается за стол 1, место 2/3");
  });

  it("stays the plain announcement when the desk reseats the room by hand", () => {
    const { container } = render(<TableMergeOverlay clock="12:30" merge={{ startedAt: STARTED_AT }} />);

    expect(screen.getByText(TABLE_MERGE_NOTICE.title)).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(container.firstElementChild?.className).not.toContain("public-break-overlay--moves");
  });

  // A full table has to fit the board without scrolling off the television.
  it("puts a long list into two columns", () => {
    const short = render(
      <TableMergeOverlay
        clock="12:30"
        merge={{ moves: [1, 2, 3, 4, 5].map((seat) => move(`P${seat}`, 1, seat)), startedAt: STARTED_AT }}
      />,
    );
    expect(short.getByRole("list").className).not.toContain("--two");
    short.unmount();

    render(
      <TableMergeOverlay
        clock="12:30"
        merge={{ moves: [1, 2, 3, 4, 5, 6].map((seat) => move(`P${seat}`, 1, seat)), startedAt: STARTED_AT }}
      />,
    );
    const list = screen.getByRole("list");
    expect(list.className).toContain("public-break-overlay__moves--two");
    // Down one column, then the next: three rows hold six moves, table by table.
    expect(list.style.gridTemplateRows).toBe("repeat(3, auto)");
  });
});
