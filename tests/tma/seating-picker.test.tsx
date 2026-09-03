/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeatingPicker } from "@/components/tma/seating-picker";

afterEach(cleanup);

const SEATED = {
  id: "p1",
  name: "Ace High",
  seat: 4,
  status: "active" as const,
  table: 1,
};

function renderPicker(overrides: Partial<Parameters<typeof SeatingPicker>[0]> = {}) {
  const onSelect = vi.fn();
  const onTakenSeat = vi.fn();

  render(
    <SeatingPicker
      onSelect={onSelect}
      onTakenSeat={onTakenSeat}
      players={[SEATED]}
      selected={null}
      tablesCount={3}
      {...overrides}
    />,
  );

  return { onSelect, onTakenSeat };
}

describe("SeatingPicker", () => {
  it("draws every table with ten chairs and marks the VIP one", () => {
    renderPicker();

    expect(screen.getAllByRole("button")).toHaveLength(30);
    expect(screen.getAllByText("VIP")).toHaveLength(1);
  });

  it("reports the chair the admin taps", () => {
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getByLabelText("Стол 1, место 7, свободно"));

    expect(onSelect).toHaveBeenCalledWith({ seat: 7, table: 1 });
  });

  it("refuses a taken chair and names who is in it", () => {
    const { onSelect, onTakenSeat } = renderPicker();

    fireEvent.click(screen.getByLabelText("Стол 1, место 4: Ace High"));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onTakenSeat).toHaveBeenCalledWith("Ace High");
  });

  it("frees the chair once a player is knocked out", () => {
    const { onSelect } = renderPicker({
      players: [{ ...SEATED, status: "eliminated" as const }],
    });

    fireEvent.click(screen.getByLabelText("Стол 1, место 4, свободно"));

    expect(onSelect).toHaveBeenCalledWith({ seat: 4, table: 1 });
  });
});
