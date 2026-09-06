/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardBatch } from "@/lib/cards/card-batch";

const rememberCardBatch = vi.fn<(input: unknown) => Promise<void>>();
const forgetCardBatch = vi.fn<(id: string) => Promise<void>>();
const refresh = vi.fn();

// The page writes through server actions and Supabase; the component under test is the
// one that decides what to show and which numbers to offer next.
vi.mock("@/app/admin/qr-codes/actions", () => ({
  forgetCardBatch: (id: string) => forgetCardBatch(id),
  rememberCardBatch: (input: unknown) => rememberCardBatch(input),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { QrCodesManager } = await import("@/components/admin/qr-codes-manager");

function batch(overrides: Partial<CardBatch> = {}): CardBatch {
  return {
    count: 10,
    createdAt: "2026-09-06T10:00:00.000Z",
    id: "batch-1",
    prefix: "MJ",
    startNumber: 1,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("QrCodesManager", () => {
  // An admin coming back for the sheet finds the run already there: the page used to
  // forget everything on reload, which is how the club printed MJ-001 twice.
  it("opens on the run the club printed last", async () => {
    render(<QrCodesManager batches={[batch()]} />);

    await screen.findByText("MJ-001");
    expect(screen.getByText("MJ-010")).toBeTruthy();
    expect(screen.getByText("Карты (10)")).toBeTruthy();
  });

  it("offers the next free number of that pack", () => {
    render(<QrCodesManager batches={[batch({ count: 100 })]} />);

    expect((screen.getByLabelText(/Начать с номера/) as HTMLInputElement).value).toBe("101");
  });

  it("starts a pack nobody has printed at one", () => {
    render(<QrCodesManager batches={[batch({ count: 100 })]} />);

    fireEvent.change(screen.getByLabelText(/Префикс/), { target: { value: "G" } });

    expect((screen.getByLabelText(/Начать с номера/) as HTMLInputElement).value).toBe("1");
  });

  it("writes a run down as it generates it", async () => {
    render(<QrCodesManager batches={[]} />);

    fireEvent.change(screen.getByLabelText(/Сколько карт/), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Сгенерировать"));

    await waitFor(() =>
      expect(rememberCardBatch).toHaveBeenCalledWith({ count: 3, prefix: "MJ", startNumber: 1 }),
    );
    await screen.findByText("MJ-003");
    expect((screen.getByLabelText(/Начать с номера/) as HTMLInputElement).value).toBe("4");
  });

  // A run the history never took must not look like one it did: the numbers would be
  // handed out twice.
  it("says so when the run does not reach the history", async () => {
    rememberCardBatch.mockRejectedValueOnce(new Error("offline"));
    render(<QrCodesManager batches={[]} />);

    fireEvent.click(screen.getByText("Сгенерировать"));

    await screen.findByText(/Тираж не записался/);
    expect(screen.getByText("Карты (0)")).toBeTruthy();
  });

  it("reopens a printed run without writing it down twice", async () => {
    render(<QrCodesManager batches={[batch({ count: 2, id: "b1", startNumber: 5 })]} />);

    await screen.findByText("MJ-006");
    fireEvent.click(screen.getByText("MJ-005 — MJ-006"));

    await waitFor(() => expect(screen.getByText("Карты (2)")).toBeTruthy());
    expect(rememberCardBatch).not.toHaveBeenCalled();
  });

  it("keeps a run that the admin declines to drop", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<QrCodesManager batches={[batch()]} />);

    fireEvent.click(screen.getByLabelText("Убрать тираж MJ-001 — MJ-010"));

    expect(forgetCardBatch).not.toHaveBeenCalled();
  });

  it("drops a run once the admin confirms", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<QrCodesManager batches={[batch()]} />);

    fireEvent.click(screen.getByLabelText("Убрать тираж MJ-001 — MJ-010"));

    await waitFor(() => expect(forgetCardBatch).toHaveBeenCalledWith("batch-1"));
  });
});
