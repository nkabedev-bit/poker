"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { closeBrowserScan, type BrowserScanRequest } from "./browser-webapp";

/** Often enough to feel instant, rarely enough for an old phone to keep up. */
const SCAN_INTERVAL_MS = 200;

/** A card's code fills the view, so a frame read at this width loses nothing. */
const MAX_FRAME_WIDTH = 640;

type ReadFrame = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

type NativeBarcodeDetector = {
  new (options: { formats: string[] }): { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
  getSupportedFormats?: () => Promise<string[]>;
};

/**
 * Chrome on Android reads QR codes itself; Safari on the iPhone does not, and there the
 * frames go through jsQR, fetched only when a scanner actually opens.
 */
async function createFrameReader(): Promise<ReadFrame> {
  const Detector = (window as unknown as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
  if (Detector) {
    try {
      const formats = await Detector.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const detector = new Detector({ formats: ["qr_code"] });
        return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
      }
    } catch {
      // A detector that cannot start is no reason to leave the desk without a scanner.
    }
  }

  const { default: jsQR } = await import("jsqr");
  return async (video, canvas) => {
    const scale = Math.min(1, MAX_FRAME_WIDTH / (video.videoWidth || MAX_FRAME_WIDTH));
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!width || !height || !context) return null;

    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const frame = context.getImageData(0, 0, width, height);
    return jsQR(frame.data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

/**
 * Telegram's QR popup, drawn by the desk in a phone's browser: the back camera full
 * screen, read a few times a second until the screen that asked takes a code.
 */
export function BrowserQrScanner({ request }: { request: BrowserScanRequest }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("Браузер не даёт камеру. Закройте и введите код карты вручную.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "environment" },
        });
      } catch {
        setProblem("Нет доступа к камере. Разрешите её в настройках браузера или введите код карты вручную.");
        return;
      }

      const video = videoRef.current;
      if (stopped || !video) return;

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Muted inline video plays on its own on every phone the desk runs on.
      }

      const readFrame = await createFrameReader();
      const canvas = document.createElement("canvas");

      const tick = async () => {
        if (stopped) return;

        if (video.readyState >= video.HAVE_ENOUGH_DATA) {
          const text = await readFrame(video, canvas).catch(() => null);
          if (stopped) return;
          if (text && request.onCode(text) === true) {
            closeBrowserScan();
            return;
          }
        }

        timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
      };
      void tick();
    };

    void start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [request]);

  return (
    <div aria-label="Сканер QR-кода" className="tma-scanner" role="dialog">
      <div className="tma-scanner__view">
        <video ref={videoRef} autoPlay muted playsInline className="tma-scanner__video" />
        <div aria-hidden="true" className="tma-scanner__frame" />
      </div>
      <p className="tma-scanner__text">{problem || request.text || "Наведите на QR-код"}</p>
      <button className="tma-btn tma-btn--big tma-scanner__close" type="button" onClick={closeBrowserScan}>
        <X size={18} /> Закрыть
      </button>
    </div>
  );
}
