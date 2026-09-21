/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/client/layout", () => ({
  useClientTMA: () => ({ initData: "mock-init", telegramUser: null }),
}));

const { default: ClientMedalsPage } = await import("@/app/client/medals/page");

function respondWithMedals(medals: Record<string, number>, archiveMedals: Record<string, number> = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ archiveMedals, medals, stats: {} })));
}

describe("client mini-app: медали", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a card for every tournament type", async () => {
    respondWithMedals({});

    render(<ClientMedalsPage />);

    for (const title of [
      "PHOENIX",
      "DEEP STACK",
      "BOUNTY",
      "PROGRESSIVE",
      "MYSTERY",
      "FREEROLL",
      "LAST CHANCE",
    ]) {
      expect(await screen.findByText(title)).toBeTruthy();
    }
  });

  it("turns a second win of the same tournament into x2", async () => {
    respondWithMedals({ freeroll: 2 });

    render(<ClientMedalsPage />);

    expect(await screen.findByText("x2")).toBeTruthy();
    // The other six stay at zero, and so do the three archive tournaments below them.
    expect(screen.getAllByText("x0")).toHaveLength(9);
  });

  it("counts the distinct medals in the header", async () => {
    respondWithMedals({ freeroll: 2, phoenix: 1 });

    render(<ClientMedalsPage />);

    expect(await screen.findByText(/2 \/ 7/)).toBeTruthy();
  });

  it("shows an empty collection when the profile does not load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));

    render(<ClientMedalsPage />);

    await waitFor(() => expect(screen.getByText(/0 \/ 7/)).toBeTruthy());
  });

  it("shows the archive tournaments under their own heading", async () => {
    respondWithMedals({}, { dealer: 1 });

    render(<ClientMedalsPage />);

    expect(await screen.findByText("Медали за архивные турниры")).toBeTruthy();

    for (const title of ["MTT CLASSIC", "WANTED BOUNTY", "DEALER REVENGE"]) {
      expect(await screen.findByText(title)).toBeTruthy();
    }
  });

  it("leaves the counter of the medals still to be won alone", async () => {
    respondWithMedals({}, { dealer: 1, mttclassic: 1, wanted: 1 });

    render(<ClientMedalsPage />);

    expect(await screen.findByText(/0 \/ 7/)).toBeTruthy();
  });
});
