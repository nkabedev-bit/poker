/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ClientAboutPage from "@/app/client/about/page";
import { ABOUT_CLUB_PHOTO, ABOUT_CLUB_SECTIONS } from "@/lib/client/about-club";

describe("client mini-app: О клубе", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the club photo and the way back to the home screen", () => {
    const { container } = render(<ClientAboutPage />);

    expect(container.querySelector(`img[src="${ABOUT_CLUB_PHOTO}"]`)).not.toBeNull();
    expect(container.querySelector('a[href="/client"]')).not.toBeNull();
  });

  it("keeps the rules a player joins for: no money, the fee, the seat limit", () => {
    render(<ClientAboutPage />);

    expect(screen.getByText(/никаких денежных ставок/i)).toBeTruthy();
    expect(screen.getByText(/Выиграть деньги в MAJESTIC невозможно/i)).toBeTruthy();
    expect(screen.getByText(/1250 ₽/)).toBeTruthy();
    expect(screen.getByText(/до 27 участников/)).toBeTruthy();
  });

  it("renders every section heading and every bullet of the copy", () => {
    render(<ClientAboutPage />);

    for (const section of ABOUT_CLUB_SECTIONS) {
      if (section.title) expect(screen.getByText(section.title)).toBeTruthy();

      for (const block of section.blocks) {
        if (block.kind === "list") {
          for (const item of block.items) expect(screen.getByText(item)).toBeTruthy();
        }
        if (block.kind === "group") expect(screen.getByText(block.title)).toBeTruthy();
      }
    }
  });

  it("closes with the club's welcome line", () => {
    render(<ClientAboutPage />);

    expect(screen.getByText(/Добро пожаловать в MAJESTIC/i)).toBeTruthy();
  });
});
