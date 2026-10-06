import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirectMock(path) }));

describe("the bare domain", () => {
  it("opens the club app for players", async () => {
    const { default: Home } = await import("@/app/page");
    Home();
    expect(redirectMock).toHaveBeenCalledWith("/client");
  });
});
