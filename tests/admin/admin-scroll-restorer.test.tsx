/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminScrollRestorer } from "@/components/admin/admin-scroll-restorer";

const scrollKey = "poker-admin-scroll-y";

describe("AdminScrollRestorer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 420,
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        window.setTimeout(() => callback(0), 0);
        return 0;
      },
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stops restoring scroll when user tries to scroll after saving", () => {
    const { container } = render(
      <>
        <AdminScrollRestorer />
        <form>
          <button type="submit">Save</button>
        </form>
      </>,
    );

    fireEvent.submit(container.querySelector("form")!);
    expect(window.sessionStorage.getItem(scrollKey)).toBe("420");

    fireEvent.wheel(document);
    vi.runOnlyPendingTimers();

    expect(window.sessionStorage.getItem(scrollKey)).toBeNull();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
