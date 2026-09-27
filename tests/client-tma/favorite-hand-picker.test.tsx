/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FavoriteHandCard,
  FavoriteHandPicker,
} from "@/app/client/_components/favorite-hand-picker";

afterEach(() => cleanup());

/** Picks one card: its rank, then its suit, in the named half of the picker. */
function pick(card: "Первая карта" | "Вторая карта", rank: string, suit: string) {
  const group = within(screen.getByRole("group", { name: card }));
  fireEvent.click(group.getByRole("button", { name: rank }));
  fireEvent.click(group.getByRole("button", { name: suit }));
}

describe("FavoriteHandPicker", () => {
  it("saves the two cards once both are picked, in the order they were", async () => {
    const onSave = vi.fn(async () => null);
    render(<FavoriteHandPicker current={null} onClose={() => {}} onSave={onSave} />);

    const save = screen.getByRole("button", { name: "Сохранить" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    pick("Первая карта", "Q", "пики");
    expect(save.disabled).toBe(true);
    pick("Вторая карта", "10", "пики");
    expect(save.disabled).toBe(false);

    fireEvent.click(save);

    await waitFor(() => expect(onSave).toHaveBeenCalledWith("QsTs"));
  });

  // The same card twice is no hand: the one choice that would make it is greyed out.
  it("never offers the card the other half already is", () => {
    render(<FavoriteHandPicker current={null} onClose={() => {}} onSave={async () => null} />);

    pick("Первая карта", "A", "червы");
    const second = within(screen.getByRole("group", { name: "Вторая карта" }));
    fireEvent.click(second.getByRole("button", { name: "A" }));

    expect((second.getByRole("button", { name: "червы" }) as HTMLButtonElement).disabled).toBe(true);
    expect((second.getByRole("button", { name: "бубны" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens on the hand the player already has, and can take it off", async () => {
    const onSave = vi.fn(async () => null);
    render(<FavoriteHandPicker current="KdQd" onClose={() => {}} onSave={onSave} />);

    const first = within(screen.getByRole("group", { name: "Первая карта" }));
    expect(first.getByRole("button", { name: "K" }).getAttribute("aria-pressed")).toBe("true");
    expect(first.getByRole("button", { name: "бубны" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Убрать руку" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it("offers nothing to take off when there is no hand yet", () => {
    render(<FavoriteHandPicker current={null} onClose={() => {}} onSave={async () => null} />);

    expect(screen.queryByRole("button", { name: "Убрать руку" })).toBeNull();
  });

  it("shows why the club refused it and stays open", async () => {
    render(
      <FavoriteHandPicker
        current={null}
        onClose={() => {}}
        onSave={async () => "Любимая рука откроется со статуса MEMBER — это 5 игр в клубе."}
      />,
    );

    pick("Первая карта", "7", "трефы");
    pick("Вторая карта", "2", "червы");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText(/откроется со статуса MEMBER/)).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Любимая рука" })).toBeTruthy();
  });

  it("closes on the cross and on Отмена without saving anything", () => {
    const onClose = vi.fn();
    const onSave = vi.fn(async () => null);
    render(<FavoriteHandPicker current={null} onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("FavoriteHandCard", () => {
  it("is locked below MEMBER, saying how many games are left", () => {
    const onOpen = vi.fn();
    render(<FavoriteHandCard games={3} hand={null} tier={null} onOpen={onOpen} />);

    expect(screen.getByText("Откроется со статуса MEMBER — ещё 2 игры")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a member's hand and opens the picker", () => {
    const onOpen = vi.fn();
    render(<FavoriteHandCard games={12} hand="QsTs" tier="member" onOpen={onOpen} />);

    const card = screen.getByRole("button", { name: /Любимая рука/ });
    expect(card.textContent).toContain("Q♠10♠");

    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
