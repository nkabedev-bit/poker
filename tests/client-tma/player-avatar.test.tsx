/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlayerAvatar } from "@/app/client/_components/player-avatar";

const STORED = "https://project.supabase.co/storage/v1/object/public/player-avatars/thumbs/42.webp?v=7";

describe("PlayerAvatar", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("loads a stored photo from the club's own domain", () => {
    render(<PlayerAvatar name="kabedev" photoUrl={STORED} />);

    const photo = screen.getByRole("presentation", { hidden: true });
    expect(photo.getAttribute("src")).toBe("/media/player-avatars/thumbs/42.webp?v=7");
  });

  it("wears the first letter when there is no photo", () => {
    render(<PlayerAvatar name="kabedev" />);

    expect(screen.getByText("K")).toBeTruthy();
  });

  it("wears the first letter when the photo will not load", () => {
    render(<PlayerAvatar name="kabedev" photoUrl={STORED} />);

    fireEvent.error(screen.getByRole("presentation", { hidden: true }));

    expect(screen.queryByRole("presentation", { hidden: true })).toBeNull();
    expect(screen.getByText("K")).toBeTruthy();
  });

  // A player who uploads a new photo gets a new address; it deserves its own try.
  it("tries a new photo even after the old one failed", () => {
    const { rerender } = render(<PlayerAvatar name="kabedev" photoUrl={STORED} />);
    fireEvent.error(screen.getByRole("presentation", { hidden: true }));

    rerender(<PlayerAvatar name="kabedev" photoUrl={STORED.replace("v=7", "v=8")} />);

    expect(screen.getByRole("presentation", { hidden: true }).getAttribute("src")).toBe(
      "/media/player-avatars/thumbs/42.webp?v=8",
    );
  });
});
