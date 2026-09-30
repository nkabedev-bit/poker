/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerAvatar } from "@/app/client/_components/player-avatar";

afterEach(() => cleanup());

describe("the favourite hand on an avatar", () => {
  it("draws the two cards over the corner of the face, the ten written out", () => {
    render(<PlayerAvatar hand="QsTh" name="Chura" size={72} />);

    const hand = screen.getByRole("img", { name: "Любимая рука: Q♠ 10♥" });
    const cards = [...hand.children] as HTMLElement[];

    expect(cards.map((card) => card.textContent)).toEqual(["Q♠", "10♥"]);
    // Spades print black, hearts red — the way the club's own deck does.
    expect(cards[0]?.style.color).toBe("rgb(21, 16, 15)");
    expect(cards[1]?.style.color).toBe("rgb(200, 33, 63)");
  });

  it("shows only the face when the player has not picked a hand", () => {
    render(<PlayerAvatar name="Vera" size={34} />);

    expect(screen.getByText("VE")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Любимая рука/ })).toBeNull();
  });

  it("draws nothing for a stored value that is not a hand", () => {
    render(<PlayerAvatar hand="QsQs" name="Vera" size={34} />);

    expect(screen.queryByRole("img", { name: /Любимая рука/ })).toBeNull();
  });

  // A list draws faces 34 pixels across; the cards still have to read as cards there.
  it("keeps the cards legible on the small faces of a list", () => {
    render(<PlayerAvatar hand="AhKd" name="Chura" size={34} />);

    const card = screen.getByRole("img", { name: /Любимая рука/ }).children[0] as HTMLElement;
    expect(parseInt(card.style.width, 10)).toBeGreaterThanOrEqual(13);
  });

  // A profile draws the face 72 pixels across; the fan stays in its lower-right quarter
  // instead of reaching across the face.
  it("keeps the cards to the corner of a profile's face", () => {
    render(<PlayerAvatar hand="AsAh" name="Chura" size={72} />);

    const fan = screen.getByRole("img", { name: /Любимая рука/ });
    const px = (value: string) => parseInt(value, 10);
    const left = 72 - px(fan.style.right) - px(fan.style.width);
    const top = 72 - px(fan.style.bottom) - px(fan.style.height);

    expect(left).toBeGreaterThanOrEqual(72 / 2);
    expect(top).toBeGreaterThanOrEqual(72 / 2);
  });
});
