"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getPlateColorHex, type PlateChoice } from "@/lib/players/plates";
import { drawPlate, type PlateDrawing } from "@/lib/players/plate-shapes";

type Size = { height: number; width: number };

/**
 * Draws a player's plate to the size of the element `ref` is put on, and draws it again
 * whenever that element is resized — a row on the hall's screen changes height as
 * players drop out, and the shape is worked out in that row's own pixels.
 *
 * Null until the element is measured, and for no plate at all.
 */
export function usePlateDrawing<T extends HTMLElement>(plate: PlateChoice | null | undefined) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size | null>(null);
  const hasPlate = Boolean(plate);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!hasPlate || !element) return;

    const measure = () => {
      const next = { height: element.clientHeight, width: element.clientWidth };
      setSize((current) =>
        current && current.width === next.width && current.height === next.height ? current : next,
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPlate]);

  const form = plate?.form;
  const color = plate?.color;
  const drawing = useMemo(
    () =>
      form && size && size.width > 0 && size.height > 0
        ? drawPlate(form, getPlateColorHex(color), size.width, size.height)
        : null,
    [color, form, size],
  );

  return { drawing, ref };
}

/** The padding that keeps a row's content clear of the plate's ends. */
export function getPlatePadding(drawing: PlateDrawing | null): CSSProperties | undefined {
  return drawing ? { paddingLeft: drawing.padLeft, paddingRight: drawing.padRight } : undefined;
}

/**
 * The plate's layers, laid behind the content of the element that measured them. That
 * element carries `player-plate-row`, which keeps the layers under its content.
 *
 * `sheenDelay` staggers the champions' sheen, so the plates on one screen do not all
 * flash at once.
 */
export function PlateArt({ drawing, sheenDelay = 0 }: { drawing: PlateDrawing; sheenDelay?: number }) {
  return (
    <div aria-hidden className="player-plate-art">
      {drawing.layers.map((layer, index) => {
        const style: CSSProperties = { boxSizing: "border-box", position: "absolute", ...layer.style };
        const piece = (
          <div
            className={layer.sheen ? "player-plate-sheen" : undefined}
            key={layer.wrap ? undefined : index}
            style={layer.sheen ? { ...style, animationDelay: `${sheenDelay}s` } : style}
          />
        );

        return layer.wrap ? (
          <div key={index} style={{ inset: 0, position: "absolute", ...layer.wrap }}>
            {piece}
          </div>
        ) : (
          piece
        );
      })}
      {drawing.monogram ? (
        <div className="player-plate-monogram" style={drawing.monogram}>
          APC
        </div>
      ) : null}
    </div>
  );
}
