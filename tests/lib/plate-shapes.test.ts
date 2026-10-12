import { describe, expect, it } from "vitest";
import { drawPlate, insetPolygon, mixColors } from "@/lib/players/plate-shapes";
import { PLATE_FORMS } from "@/lib/players/plates";

const ROW_HEIGHTS = [14, 24, 36, 56];

describe("drawing a plate", () => {
  it("draws every shape at every row height and leaves the nickname room", () => {
    for (const { id } of PLATE_FORMS) {
      for (const height of ROW_HEIGHTS) {
        const drawing = drawPlate(id, "#D2263F", 410, height);

        expect(drawing.layers.length, `${id} at ${height}px`).toBeGreaterThan(0);
        expect(drawing.padLeft, `${id} at ${height}px`).toBeGreaterThanOrEqual(8);
        expect(drawing.padRight, `${id} at ${height}px`).toBeGreaterThan(0);
        // At least half of the row stays free for the badges and the nickname.
        expect(drawing.padLeft + drawing.padRight, `${id} at ${height}px`).toBeLessThan(205);
      }
    }
  });

  it("keeps ornament off a short row and adds it to a tall one", () => {
    const short = drawPlate("quads", "#3C7BE0", 410, 14);
    const tall = drawPlate("quads", "#3C7BE0", 410, 56);

    expect(tall.layers.length).toBeGreaterThan(short.layers.length);
  });

  it("gives only a champion's shape the sheen", () => {
    const sheen = (form: Parameters<typeof drawPlate>[0]) =>
      drawPlate(form, "#9A5BD8", 410, 36).layers.some((layer) => layer.sheen);

    expect(sheen("royal_flush")).toBe(true);
    expect(sheen("jackpot")).toBe(true);
    expect(sheen("gatsby")).toBe(false);
    // Nothing is drawn moving on a row where nothing else is.
    expect(drawPlate("royal_flush", "#9A5BD8", 410, 14).layers.some((layer) => layer.sheen)).toBe(false);
  });

  it("sets the APC monogram in letters once there is room for it", () => {
    expect(drawPlate("apc", "#000000", 410, 14).monogram).toBeUndefined();
    expect(drawPlate("apc", "#000000", 410, 36).monogram).toBeDefined();
  });

  it("keeps the second-place laurels in proportion and stretches only the middle", () => {
    const [left, middle, right] = drawPlate("apc_second", "#000000", 410, 33).layers;

    expect(left.style).toMatchObject({ height: "33px", left: "0px", width: "19px" });
    expect(right.style).toMatchObject({ left: "338px", width: "72px" });
    expect(middle.style.width).toBe("321px");
  });

  it("blends colours and insets outlines exactly", () => {
    expect(mixColors("#ff0000", "#000000", 0.5)).toBe("#800000");
    expect(insetPolygon([[0, 0], [10, 0], [10, 10], [0, 10]], 2)).toEqual([
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
    ]);
  });
});
