"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { CLUB_FONT_CLASSES } from "../fonts";
import { getClientTelegramWebApp, showClientAlert } from "../layout";
import { GhostButton, PrimaryButton } from "./ui";
import {
  clampCropView,
  getCoverScale,
  INITIAL_CROP_VIEW,
  MAX_CROP_ZOOM,
  renderCropToDataUrl,
  zoomCropView,
  type CropView,
} from "@/lib/media/photo-crop";

/** The frame never grows past this: a profile photo is a face, not a landscape. */
const MAX_FRAME = 360;
/** Room kept between the frame and the edges of the photo area. */
const FRAME_MARGIN = 48;
/** How far one notch of a mouse wheel brings the photo closer. */
const WHEEL_ZOOM_STEP = 0.0015;

type Point = { x: number; y: number };

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** A point on screen measured from the frame's centre, which is the photo area's centre. */
function fromFrameCentre(stage: HTMLElement | null, point: Point): Point {
  const rect = stage?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 };
}

/**
 * The player's say in which part of their photo goes in the circle. They drag it with a
 * finger, bring it closer with two or with the slider (the wheel on a computer) and keep
 * the square the circle sits in.
 */
export function PhotoCropper({
  onCancel,
  onSave,
  src,
}: {
  onCancel: () => void;
  /** Stores the framed square; answers whether it was stored, so a failure can be retried. */
  onSave: (dataUrl: string) => Promise<boolean>;
  /** The photo, already upright and small enough to move about smoothly. */
  src: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const [frame, setFrame] = useState(0);
  const [size, setSize] = useState<{ height: number; width: number } | null>(null);
  const [view, setView] = useState<CropView>(INITIAL_CROP_VIEW);
  const [saving, setSaving] = useState(false);

  // The frame follows the room the photo area has: a phone held upright, a computer.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const room = Math.min(stage.clientWidth, stage.clientHeight) - FRAME_MARGIN;
      setFrame(Math.max(120, Math.min(MAX_FRAME, room)));
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(stage);
    return () => observer?.disconnect();
  }, []);

  // Telegram folds the app away on a swipe down, which is just what moving a photo down
  // looks like; the swipe is held back while the photo is being framed.
  useEffect(() => {
    const tg = getClientTelegramWebApp();
    if (!tg?.disableVerticalSwipes || !tg.isVersionAtLeast?.("7.7")) return;

    const wasEnabled = tg.isVerticalSwipesEnabled !== false;
    tg.disableVerticalSwipes();
    return () => {
      if (wasEnabled) tg.enableVerticalSwipes?.();
    };
  }, []);

  // A native listener: React's wheel handler is passive, and the page behind would scroll.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !size || !frame) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const anchor = fromFrameCentre(stage, { x: event.clientX, y: event.clientY });
      setView((current) =>
        zoomCropView(current, current.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_STEP), anchor, size, frame),
      );
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [frame, size]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    const before = pointers.get(event.pointerId);
    if (!before || !size || !frame) return;

    const after = { x: event.clientX, y: event.clientY };
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    pointers.set(event.pointerId, after);

    if (!other) {
      setView((current) =>
        clampCropView(
          { ...current, x: current.x + after.x - before.x, y: current.y + after.y - before.y },
          size,
          frame,
        ),
      );
      return;
    }

    // Two fingers: the photo follows the point between them and grows as they part.
    const spreadBefore = distance(before, other);
    if (spreadBefore === 0) return;
    const ratio = distance(after, other) / spreadBefore;
    const middleBefore = midpoint(before, other);
    const middleAfter = midpoint(after, other);
    const anchor = fromFrameCentre(stageRef.current, middleAfter);

    setView((current) =>
      zoomCropView(
        {
          ...current,
          x: current.x + middleAfter.x - middleBefore.x,
          y: current.y + middleAfter.y - middleBefore.y,
        },
        current.zoom * ratio,
        anchor,
        size,
        frame,
      ),
    );
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
  };

  const coverScale = size && frame ? getCoverScale(size, frame) : 0;
  // Drawn clamped: a new frame size (the phone turned over) may leave the stored view
  // short of an edge, and the next drag clamps it for good.
  const shownView = size && frame ? clampCropView(view, size, frame) : view;

  const save = async () => {
    const image = imageRef.current;
    if (!image || !frame || saving) return;

    const dataUrl = renderCropToDataUrl(image, shownView, frame);
    if (!dataUrl) {
      showClientAlert("Не удалось обрезать фото — попробуйте другое");
      return;
    }

    setSaving(true);
    const saved = await onSave(dataUrl);
    // Once stored the cropper is closed by the page; otherwise it stays for another go.
    if (!saved) setSaving(false);
  };

  // Drawn on the page's body, like the other sheets, so the app's menu stays underneath.
  return createPortal(
    <div
      aria-label="Выбор кадра"
      aria-modal="true"
      className={`client-app ${CLUB_FONT_CLASSES} fixed inset-0 z-50 flex flex-col overscroll-none bg-[#050304] text-club-text`}
      role="dialog"
    >
      <div className="px-4 pb-2 pt-[calc(env(safe-area-inset-top)+16px)] text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">Фото профиля</div>
        <div className="font-display text-[20px] font-semibold">Выберите кадр</div>
      </div>

      <div
        className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
        data-testid="photo-cropper-stage"
        ref={stageRef}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, drawn as is */}
        <img
          alt=""
          className="pointer-events-none absolute left-1/2 top-1/2"
          draggable={false}
          ref={imageRef}
          src={src}
          style={{
            height: size ? size.height * coverScale : undefined,
            maxWidth: "none",
            // Hidden until it can be laid out at its size, so it never flashes full-width.
            opacity: coverScale ? 1 : 0,
            transform: `translate(-50%, -50%) translate(${shownView.x}px, ${shownView.y}px) scale(${shownView.zoom})`,
            width: size ? size.width * coverScale : undefined,
          }}
          onError={() => {
            showClientAlert("Не удалось открыть фото — выберите другое");
            onCancel();
          }}
          onLoad={(event) =>
            setSize({ height: event.currentTarget.naturalHeight, width: event.currentTarget.naturalWidth })
          }
        />

        {frame ? (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(5,3,4,0.72)]"
            style={{ height: frame, width: frame }}
          />
        ) : null}

        {!size ? (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="animate-spin text-club-muted" size={28} />
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-[420px] flex-col gap-4 px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-4">
        <p className="text-center text-[13px] leading-relaxed text-club-muted">
          Двигайте фото пальцем, приближайте двумя пальцами или ползунком
        </p>

        <div className="flex items-center gap-3">
          <ZoomOut aria-hidden className="shrink-0 text-club-muted" size={18} />
          <input
            aria-label="Приближение"
            className="h-6 min-w-0 flex-1 accent-club-rose"
            disabled={!size}
            max={MAX_CROP_ZOOM}
            min={1}
            step={0.01}
            type="range"
            value={shownView.zoom}
            onChange={(event) => {
              if (!size || !frame) return;
              setView((current) =>
                zoomCropView(current, Number(event.target.value), { x: 0, y: 0 }, size, frame),
              );
            }}
          />
          <ZoomIn aria-hidden className="shrink-0 text-club-muted" size={18} />
        </div>

        <div className="flex gap-2.5">
          <GhostButton className="flex-1" disabled={saving} type="button" onClick={onCancel}>
            Отмена
          </GhostButton>
          <PrimaryButton
            className="flex-1"
            disabled={!size}
            loading={saving}
            type="button"
            onClick={() => void save()}
          >
            Сохранить
          </PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
