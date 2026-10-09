/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserWebApp, readBrowserScanRequest } from "@/app/tma/browser-webapp";
import { BrowserQrScanner } from "@/app/tma/qr-scanner";

function openScanner(onCode: (text: string) => boolean | void) {
  act(() => {
    browserWebApp.showScanQrPopup?.({ text: "Наведите на QR-код карты" }, onCode);
  });
  const request = readBrowserScanRequest();
  if (!request) throw new Error("the scanner did not open");
  return render(<BrowserQrScanner request={request} />);
}

describe("BrowserQrScanner", () => {
  const stopTrack = vi.fn();

  beforeEach(() => {
    stopTrack.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  });

  afterEach(() => {
    cleanup();
    browserWebApp.closeScanQrPopup?.();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  function giveCamera() {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) },
    });
  }

  it("hands the card's code to the screen and lets the camera go", async () => {
    giveCamera();
    vi.stubGlobal(
      "BarcodeDetector",
      class {
        static getSupportedFormats = async () => ["qr_code"];
        detect = async () => [{ rawValue: "MJ-012" }];
      },
    );
    const onCode = vi.fn(() => true);

    openScanner(onCode);

    await waitFor(() => expect(onCode).toHaveBeenCalledWith("MJ-012"));
    expect(readBrowserScanRequest()).toBeNull();
    cleanup();
    expect(stopTrack).toHaveBeenCalled();
  });

  it("says how to go on when the browser gives no camera", async () => {
    openScanner(vi.fn());

    expect(
      await screen.findByText("Браузер не даёт камеру. Закройте и введите код карты вручную."),
    ).toBeTruthy();
  });

  it("says so when the camera is refused", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => Promise.reject(new Error("NotAllowedError"))) },
    });

    openScanner(vi.fn());

    expect(await screen.findByText(/Нет доступа к камере/)).toBeTruthy();
  });

  it("closes on «Закрыть»", () => {
    openScanner(vi.fn());

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(readBrowserScanRequest()).toBeNull();
  });
});
