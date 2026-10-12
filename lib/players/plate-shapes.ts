import type { CSSProperties } from "react";
import type { PlateForm } from "@/lib/players/plates";

/**
 * How a plate is drawn, carried over from the club's design (Claude Design, «Плашки
 * игроков — пресеты», the «Компонент плашки» board).
 *
 * A plate is a stack of absolutely placed layers cut to one outline with clip-path: the
 * edge, the body inset by the edge's width, a gloss, then the shape's ornament at the
 * right end. Every point is worked out in pixels from the row's own size, so the middle
 * stretches with the column while the ends keep their proportions; nothing is ever
 * squeezed. Three levels of detail follow the row's height — under 20 px only the
 * silhouette and the coloured edge are left, under 30 px a little ornament, above it all.
 */
export type PlateLayer = {
  /** The layer itself, placed inside the plate. */
  style: CSSProperties;
  /** A wrapper for what a clip-path would cut away: blur for a glow. */
  wrap?: CSSProperties;
  /** The slow sheen of a champion's plate, which the screen may switch off. */
  sheen?: boolean;
};

export type PlateDrawing = {
  layers: PlateLayer[];
  /** The APC monogram, set in letters rather than drawn. */
  monogram?: CSSProperties;
  /** Room the content keeps from each end, so a nickname never runs over the ornament. */
  padLeft: number;
  padRight: number;
};

type Point = [number, number];

const CHAMPION_FORMS = new Set<PlateForm>(["jackpot", "nuts", "triumph", "royal_flush"]);

/** How much of the colour the body takes: past a sixth a column of players turns gaudy. */
const BODY_TINT = 0.16;

/** The 2nd-place APC art, cut in three so the laurels keep their shape at any height. */
const APC_SECOND_ART = {
  height: 330,
  left: { src: "/plates/apc-second-left.webp", width: 190 },
  middle: "/plates/apc-second-mid.webp",
  right: { src: "/plates/apc-second-right.webp", width: 720 },
};

function readRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Two colours blended channel by channel: `share` of the first, the rest of the second. */
export function mixColors(first: string, second: string, share: number) {
  const a = readRgb(first);
  const b = readRgb(second);

  return `#${a
    .map((channel, index) => {
      const value = Math.max(0, Math.min(255, Math.round(channel * share + b[index] * (1 - share))));
      return value.toString(16).padStart(2, "0");
    })
    .join("")}`;
}

function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = readRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function px(value: number) {
  return `${Math.round(value * 100) / 100}px`;
}

function polygon(points: Point[]) {
  return `polygon(${points.map(([x, y]) => `${px(x)} ${px(y)}`).join(",")})`;
}

/** The outline moved inwards by `distance`, each side parallel to the one it came from. */
export function insetPolygon(points: Point[], distance: number): Point[] {
  const count = points.length;
  const lines: [number, number, number, number][] = [];

  for (let index = 0; index < count; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % count];
    let dx = x2 - x1;
    let dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    lines.push([x1 - dy * distance, y1 + dx * distance, dx, dy]);
  }

  return lines.map((line, index) => {
    const previous = lines[(index - 1 + count) % count];
    const cross = previous[2] * line[3] - previous[3] * line[2];
    if (Math.abs(cross) < 1e-9) return [line[0], line[1]];

    const t = ((line[0] - previous[0]) * line[3] - (line[1] - previous[1]) * line[2]) / cross;
    return [previous[0] + previous[2] * t, previous[1] + previous[3] * t];
  });
}

function starPoints(cx: number, cy: number, outer: number, inner: number, rays: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index < rays * 2; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / rays;
    const radius = index % 2 === 0 ? outer : inner;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

const FULL: CSSProperties = { inset: 0 };

function box(x: number, y: number, width: number, height: number): CSSProperties {
  return { height: px(height), left: px(x), top: px(y), width: px(width) };
}

function insetBox(distance: number): CSSProperties {
  return { inset: px(distance) };
}

/**
 * Draws a plate of the given shape and colour for a row `width` × `height` pixels.
 * `accent` is the colour as a hex; the plates with their own art ignore it.
 */
export function drawPlate(form: PlateForm, accent: string, width: number, height: number): PlateDrawing {
  const w = Math.max(40, width);
  const h = Math.max(8, height);
  const A = accent;
  const champion = CHAMPION_FORMS.has(form);
  const level = h < 20 ? 0 : h < 30 ? 1 : 2;
  const edgeWidth = h >= 30 ? (champion ? 2.5 : 2) : 1.5;

  const light = mixColors(A, "#ffffff", 0.55);
  const dark = mixColors(A, "#000000", 0.45);
  const bodyMiddle = mixColors(A, "#0b0707", BODY_TINT);
  const bodyLeft = mixColors(A, "#050303", BODY_TINT * 0.4);
  const bodyRight = mixColors(A, "#0b0707", Math.min(1, BODY_TINT * 1.5));
  const bodyBg = `linear-gradient(90deg,${bodyLeft} 0%,${bodyMiddle} 72%,${bodyRight} 100%)`;
  const edgeBg = champion
    ? `linear-gradient(180deg,${mixColors(A, "#ffffff", 0.4)} 0%,${A} 32%,${dark} 68%,${A} 100%)`
    : `linear-gradient(180deg,${light} 0%,${A} 40%,${dark} 100%)`;
  const gloss = "linear-gradient(180deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 50%)";
  const capWidth = Math.round(Math.min(w * 0.2, h * 2.4));
  const basePad = Math.round(Math.max(8, Math.min(18, h * 0.3)));

  const layers: PlateLayer[] = [];
  const add = (style: CSSProperties, wrap?: CSSProperties) => layers.push(wrap ? { style, wrap } : { style });
  const glow = (points: Point[]) =>
    add(
      { ...FULL, background: A, clipPath: polygon(points) },
      { filter: `blur(${px(Math.max(2, h * 0.14))})`, opacity: 0.5 },
    );

  let padLeft = basePad;
  let padRight = 8;
  let monogram: CSSProperties | undefined;
  // Cast, so the check at the end still sees what the outline helper assigns.
  let bodyPoints = null as Point[] | null;
  let innerPoints: Point[] = [];

  /** A shape cut from one outline: edge, body, an optional second frame line, gloss. */
  const outline = (points: Point[], doubleFrame: boolean, withGlow = true) => {
    if (champion && level >= 1 && withGlow) glow(points);
    add({ ...FULL, background: edgeBg, clipPath: polygon(points) });

    let inner = insetPolygon(points, edgeWidth);
    if (doubleFrame && level >= 1) {
      const gap = level >= 2 ? (h >= 46 ? 3 : 2) : 2;
      add({ ...FULL, background: bodyBg, clipPath: polygon(inner) });
      add({
        ...FULL,
        background: withAlpha(light, champion ? 0.75 : 0.55),
        clipPath: polygon(insetPolygon(points, edgeWidth + gap)),
      });
      inner = insetPolygon(points, edgeWidth + gap + 1);
    }

    add({ ...FULL, background: bodyBg, clipPath: polygon(inner) });
    innerPoints = inner;
    bodyPoints = insetPolygon(points, edgeWidth);
    if (level >= 1) add({ ...FULL, background: gloss, clipPath: polygon(bodyPoints) });
  };

  /** A four-pointed star with a soft light behind it on a tall row. */
  const star = (cx: number, cy: number, radius: number) => {
    const points = starPoints(cx, cy, radius, radius * 0.34, 4);
    if (level >= 2) {
      add(
        { ...FULL, background: light, clipPath: polygon(points) },
        { filter: `blur(${px(radius * 0.45)})`, opacity: 0.75 },
      );
    }
    add({
      ...FULL,
      background: `linear-gradient(180deg,${mixColors(A, "#ffffff", 0.35)},${A})`,
      clipPath: polygon(points),
    });
  };

  if (form === "bluff") {
    // A blade: the right end cut on a slant, bands running along the cut, a guard at the left.
    const slant = Math.round(h * 0.55);
    outline([[0, 0], [w, 0], [w - slant, h], [0, h]], false);
    if (level >= 1) {
      add({
        ...box(edgeWidth + 2, edgeWidth + 2, level >= 2 ? 2.5 : 2, h - 2 * edgeWidth - 4),
        background: A,
        borderRadius: "1px",
      });
      const thickness = Math.max(2, Math.round(h * 0.13));
      const top = edgeWidth;
      const bottom = h - edgeWidth;
      const band = (from: number, size: number, style: CSSProperties) => {
        const x = (y: number) => w - from - (slant * y) / h;
        add({
          ...FULL,
          ...style,
          clipPath: polygon([[x(top) - size, top], [x(top), top], [x(bottom), bottom], [x(bottom) - size, bottom]]),
        });
      };
      const first = Math.round(h * 0.25) + 3;
      let end = first + thickness;
      band(first, thickness, { background: A });
      if (level >= 2) {
        band(first + thickness + 4, 1.2, { background: light, opacity: 0.75 });
        band(first + thickness + 10, thickness * 2.2, { background: withAlpha(A, 0.16) });
        end = first + thickness + 10 + thickness * 2.2;
      }
      padLeft = Math.min(18, basePad + 3);
      padRight = slant + end + 6;
    } else {
      padRight = slant * 0.6 + 6;
    }
  } else if (form === "button") {
    // A capsule with notches like the edge of a dealer button.
    const radius = Math.min(h / 2, 20);
    add({ ...FULL, background: edgeBg, borderRadius: px(radius) });
    add({ ...insetBox(edgeWidth), background: bodyBg, borderRadius: px(radius - edgeWidth) });
    if (level >= 1) add({ ...insetBox(edgeWidth), background: gloss, borderRadius: px(radius - edgeWidth) });
    if (level >= 2) {
      add({
        ...insetBox(edgeWidth + 2),
        border: `1px solid ${withAlpha(light, 0.22)}`,
        borderRadius: px(Math.max(0, radius - edgeWidth - 2)),
      });
    }
    if (level >= 1) {
      const count = level >= 2 ? 3 : 2;
      const notchHeight = Math.round(h * 0.46);
      const notchWidth = Math.max(2, Math.round(h * 0.075));
      const gap = Math.round(notchWidth * 1.7);
      const startX = w - Math.round(radius * 0.55) - 6 - notchWidth;
      const opacity = [1, 0.55, 0.3];
      for (let index = 0; index < count; index += 1) {
        add({
          ...box(startX - index * (notchWidth + gap), (h - notchHeight) / 2, notchWidth, notchHeight),
          background: index === 0 ? light : A,
          borderRadius: px(notchWidth / 2),
          opacity: opacity[index],
        });
      }
      padRight = w - (startX - (count - 1) * (notchWidth + gap)) + 6;
    } else {
      padRight = radius * 0.5 + 6;
    }
    padLeft = Math.min(18, Math.max(basePad, Math.round(radius * 0.75)));
  } else if (form === "satellite") {
    // A ticket: side notches, a perforation and a tinted stub with a barcode.
    const notch = level === 0 ? 3 : Math.round(h * (level === 1 ? 0.22 : 0.2));
    const small = Math.max(2, Math.round(notch * 0.55));
    const stub = Math.round(capWidth * 0.8);
    const perforation = w - stub;
    const holes: [number, number, number][] = [
      [0, h / 2, notch],
      [w, h / 2, notch],
    ];
    if (level >= 1) holes.push([perforation, 0, small], [perforation, h, small]);
    const mask = (dx: number, dy: number, grow: number): CSSProperties => {
      const image = holes
        .map(
          ([x, y, r]) =>
            `radial-gradient(circle at ${px(x - dx)} ${px(y - dy)}, transparent ${px(r + grow)}, #000 ${px(r + grow + 0.6)})`,
        )
        .join(",");
      return {
        WebkitMaskComposite: "source-in",
        WebkitMaskImage: image,
        maskComposite: "intersect",
        maskImage: image,
      };
    };
    const corner = level === 0 ? 2 : 3;
    add({ ...FULL, ...mask(0, 0, 0), background: edgeBg, borderRadius: `${corner}px` });
    add({ ...insetBox(edgeWidth), ...mask(edgeWidth, edgeWidth, edgeWidth), background: bodyBg, borderRadius: `${corner - 1}px` });
    const stubBox: CSSProperties = {
      bottom: px(edgeWidth),
      left: px(perforation),
      right: px(edgeWidth),
      top: px(edgeWidth),
      ...mask(perforation, edgeWidth, edgeWidth),
    };
    add({
      ...stubBox,
      background: `linear-gradient(90deg,${mixColors(A, "#0b0707", 0.3)},${mixColors(A, "#0b0707", 0.22)})`,
      borderRadius: `0 ${corner - 1}px ${corner - 1}px 0`,
    });
    if (level >= 1) {
      add({
        ...stubBox,
        background: `repeating-linear-gradient(-45deg,${withAlpha(A, 0.3)} 0 1.5px,transparent 1.5px 5px)`,
      });
      add({ ...insetBox(edgeWidth), ...mask(edgeWidth, edgeWidth, edgeWidth), background: gloss, borderRadius: `${corner - 1}px` });
      add({
        background: `repeating-linear-gradient(180deg,${light} 0 2px,transparent 2px 4px)`,
        bottom: px(small + edgeWidth + 1),
        left: px(perforation - 0.6),
        opacity: 0.85,
        top: px(small + edgeWidth + 1),
        width: "1.2px",
      });
    }
    if (level >= 2) {
      const bars = [1.5, 1, 2.5, 1, 1.5, 2];
      const barHeight = Math.round(h * 0.4);
      let x = perforation + Math.round((stub - notch - edgeWidth) * 0.5) - 8;
      for (const bar of bars) {
        add({ ...box(x, (h - barHeight) / 2, bar, barHeight), background: light, opacity: 0.5 });
        x += bar + 1.5;
      }
    }
    padLeft = Math.min(18, Math.max(basePad, notch + 6));
    padRight = stub + 6;
  } else if (form === "quads") {
    // Cut corners, a double frame and chevrons, like an engraved plaque.
    const cut = Math.max(3, Math.round(h * 0.28));
    outline(
      [[cut, 0], [w - cut, 0], [w, cut], [w, h - cut], [w - cut, h], [cut, h], [0, h - cut], [0, cut]],
      true,
    );
    if (level >= 1) {
      const count = level >= 2 ? 3 : 2;
      const chevronHeight = h * 0.5;
      const thickness = Math.max(1.6, h * 0.085);
      const reach = chevronHeight * 0.42;
      const step = reach + thickness + Math.max(2, h * 0.06);
      const right = w - cut - Math.max(5, h * 0.18);
      const opacity = [1, 0.55, 0.3];
      const cy = h / 2;
      for (let index = 0; index < count; index += 1) {
        const x = right - (thickness + reach) - index * step;
        add({
          ...FULL,
          background: index === 0 ? light : A,
          clipPath: polygon([
            [x, cy - chevronHeight / 2],
            [x + thickness, cy - chevronHeight / 2],
            [x + thickness + reach, cy],
            [x + thickness, cy + chevronHeight / 2],
            [x, cy + chevronHeight / 2],
            [x + reach, cy],
          ]),
          opacity: opacity[index],
        });
      }
      padRight = w - (right - (thickness + reach) - (count - 1) * step) + 6;
    } else {
      padRight = cut + 6;
    }
    padLeft = Math.min(18, basePad + Math.round(cut * 0.3));
  } else if (form === "jackpot") {
    // A standard: a swallowtail on the right, a double frame and a star.
    const tail = Math.round(h * 0.42);
    const cut = Math.max(2, Math.round(h * 0.18));
    const middle = h / 2;
    outline([[cut, 0], [w, 0], [w - tail, middle], [w, h], [cut, h], [0, h - cut], [0, cut]], true);
    if (level >= 1) {
      const inset = edgeWidth + (level >= 2 ? 3 : 2) + 1;
      const top = inset + 0.5;
      const bottom = h - inset - 0.5;
      const xAt = (from: number, y: number) => w - from - tail * (1 - Math.abs(y - middle) / middle);
      const chevron = (from: number, size: number, style: CSSProperties) =>
        add({
          ...FULL,
          ...style,
          clipPath: polygon([
            [xAt(from, top), top],
            [xAt(from, middle), middle],
            [xAt(from, bottom), bottom],
            [xAt(from + size, bottom), bottom],
            [xAt(from + size, middle), middle],
            [xAt(from + size, top), top],
          ]),
        });
      const thickness = Math.max(2, Math.round(h * 0.1));
      const first = Math.round(h * 0.22) + inset;
      let end = first + thickness;
      chevron(first, thickness, { background: A });
      if (level >= 2) {
        chevron(first + thickness + 3, 1.2, { background: light, opacity: 0.75 });
        end = first + thickness + 4.2;
      }
      const radius = h * (level >= 2 ? 0.28 : 0.3);
      const cx = w - tail - end - radius - Math.max(3, h * 0.08);
      star(cx, middle, radius);
      padRight = w - (cx - radius) + 6;
    } else {
      padRight = tail + 6;
    }
    padLeft = Math.min(18, basePad + Math.round(cut * 0.3));
  } else if (form === "nuts") {
    // Pointed ends and a medallion with rays.
    const pointLeft = Math.max(3, Math.round(h * 0.26));
    const pointRight = Math.max(4, Math.round(h * 0.5));
    const middle = h / 2;
    outline(
      [[pointLeft, 0], [w - pointRight, 0], [w, middle], [w - pointRight, h], [pointLeft, h], [0, middle]],
      true,
    );
    if (level >= 1) {
      const cx = w - pointRight - h * 0.45;
      const lineTo = (from: number) =>
        add({
          ...box(from, middle - 0.6, w - pointRight * 0.4 - from, 1.2),
          background: `linear-gradient(90deg,${A},${light})`,
        });
      if (level >= 2) {
        const radius = h * 0.3;
        const ring = Math.max(1.5, h * 0.04);
        const ray = capWidth * 0.28;
        lineTo(cx + radius);
        add({
          ...box(cx - radius, middle - radius, radius * 2, radius * 2),
          background: `radial-gradient(circle,${withAlpha(A, 0.28)},${withAlpha(A, 0)} 70%)`,
          border: `${px(ring)} solid ${A}`,
          borderRadius: "50%",
        });
        for (const offset of [-0.45, 0.45]) {
          add({
            ...box(cx - radius - ray, middle + radius * offset - 0.5, ray - 2, 1),
            background: `linear-gradient(90deg,${withAlpha(A, 0)},${A})`,
          });
        }
        star(cx, middle, radius * 0.72);
        padRight = w - (cx - radius - ray) + 4;
      } else {
        const radius = h * 0.3;
        lineTo(cx + radius);
        star(cx, middle, radius);
        padRight = w - (cx - radius) + 6;
      }
    } else {
      padRight = pointRight * 0.7 + 6;
    }
    padLeft = Math.min(18, basePad + Math.round(pointLeft * 0.5));
  } else if (form === "all_in") {
    // A slanted plate with shards fading behind it, like a trail of speed.
    const slant = Math.round(h * 0.4);
    const gap = Math.max(2, Math.round(h * 0.12));
    const shards =
      level === 0
        ? [Math.max(4, Math.round(h * 0.36))]
        : level === 1
          ? [Math.round(h * 0.36), Math.round(h * 0.22)]
          : [Math.round(h * 0.36), Math.round(h * 0.22), Math.max(3, Math.round(h * 0.12))];
    const trail = shards.reduce((sum, shard) => sum + shard + gap, 0);
    const end = w - trail;
    outline([[slant, 0], [end, 0], [end - slant, h], [0, h]], false);
    let x = end + gap;
    const opacity = [1, 0.6, 0.32];
    shards.forEach((shard, index) => {
      add({
        ...FULL,
        ...(index === 0 ? { background: edgeBg } : { background: A, opacity: opacity[index] }),
        clipPath: polygon([[x, 0], [x + shard, 0], [x + shard - slant, h], [x - slant, h]]),
      });
      x += shard + gap;
    });
    let extra = 0;
    if (level >= 2) {
      const offset = 5;
      const top = edgeWidth + 2;
      const bottom = h - edgeWidth - 2;
      const xAt = (y: number) => end - offset - (slant * y) / h;
      add({
        ...FULL,
        background: light,
        clipPath: polygon([[xAt(top) - 1.2, top], [xAt(top), top], [xAt(bottom), bottom], [xAt(bottom) - 1.2, bottom]]),
        opacity: 0.65,
      });
      extra = offset + 2;
    }
    padLeft = Math.min(18, basePad + Math.round(slant * 0.35));
    padRight = trail + slant + extra + 6;
  } else if (form === "chip_leader") {
    // A capsule that ends in a casino chip with inserts round its rim.
    const chipRadius = h / 2;
    const cx = w - chipRadius;
    const radius = Math.min(h / 2, 20);
    add({ ...box(0, 0, cx + 1, h), background: edgeBg, borderRadius: `${px(radius)} 0 0 ${px(radius)}` });
    add({
      ...box(edgeWidth, edgeWidth, cx + 1 - edgeWidth, h - 2 * edgeWidth),
      background: bodyBg,
      borderRadius: `${px(radius - edgeWidth)} 0 0 ${px(radius - edgeWidth)}`,
    });
    if (level >= 1) {
      add({
        ...box(edgeWidth, edgeWidth, cx + 1 - edgeWidth, h - 2 * edgeWidth),
        background: gloss,
        borderRadius: `${px(radius - edgeWidth)} 0 0 ${px(radius - edgeWidth)}`,
      });
    }
    const insert = mixColors(A, "#f3ece4", 0.18);
    const inserts = level === 0 ? 6 : 8;
    const segment = 360 / inserts;
    const insertWidth = segment * 0.32;
    add({
      ...box(cx - chipRadius, 0, h, h),
      background: `repeating-conic-gradient(from ${-insertWidth / 2}deg,${insert} 0deg ${insertWidth}deg,${A} ${insertWidth}deg ${segment}deg)`,
      borderRadius: "50%",
      boxShadow: "0 0 0 1.5px #070000",
    });
    const rim = Math.max(2, Math.round(h * 0.17));
    add({
      ...box(cx - chipRadius + rim, rim, h - 2 * rim, h - 2 * rim),
      background: `radial-gradient(circle at 40% 35%,${mixColors(A, "#0b0707", 0.42)},${mixColors(A, "#0b0707", 0.16)})`,
      borderRadius: "50%",
      boxShadow: `inset 0 0 0 1px ${withAlpha(light, 0.35)}`,
    });
    if (level >= 2) {
      const ring = rim + Math.max(2, h * 0.07);
      add({
        ...box(cx - chipRadius + ring, ring, h - 2 * ring, h - 2 * ring),
        border: `1px dashed ${withAlpha(light, 0.7)}`,
        borderRadius: "50%",
      });
    }
    padRight = h + 6;
    padLeft = Math.min(18, Math.max(basePad, Math.round(radius * 0.75)));
  } else if (form === "gatsby") {
    // Art deco: the right end in steps, a fan of rays and arcs.
    const step = Math.max(3, Math.round(h * 0.17));
    const rise = Math.max(3, Math.round(h * 0.17));
    const cut = Math.max(2, Math.round(h * 0.22));
    const points: Point[] =
      level === 0
        ? [[cut, 0], [w - step, 0], [w - step, rise], [w, rise], [w, h - rise], [w - step, h - rise], [w - step, h], [cut, h], [0, h - cut], [0, cut]]
        : [
            [cut, 0], [w - 2 * step, 0], [w - 2 * step, rise], [w - step, rise], [w - step, 2 * rise], [w, 2 * rise],
            [w, h - 2 * rise], [w - step, h - 2 * rise], [w - step, h - rise], [w - 2 * step, h - rise], [w - 2 * step, h],
            [cut, h], [0, h - cut], [0, cut],
          ];
    outline(points, level >= 2);
    if (level >= 1) {
      const fadeImage = `linear-gradient(90deg,transparent ${px(w - capWidth)},#000 ${px(w - capWidth * 0.3)})`;
      const fade: CSSProperties = { WebkitMaskImage: fadeImage, maskImage: fadeImage };
      const cx = w - step;
      add({
        ...FULL,
        ...fade,
        background: `repeating-conic-gradient(from 0deg at ${px(cx)} 50%,${withAlpha(A, 0.5)} 0deg 2.4deg,transparent 2.4deg 11.25deg)`,
        clipPath: polygon(innerPoints),
      });
      if (level >= 2) {
        const near = h * 0.55;
        const far = h * 0.85;
        add({
          ...FULL,
          ...fade,
          background: `radial-gradient(circle at ${px(cx)} 50%,transparent ${px(near - 0.7)},${light} ${px(near)},transparent ${px(near + 0.9)},transparent ${px(far - 0.7)},${A} ${px(far)},transparent ${px(far + 0.9)})`,
          clipPath: polygon(innerPoints),
          opacity: 0.85,
        });
      }
      padRight = capWidth * 0.8 + 2 * step;
    } else {
      padRight = step + 6;
    }
    padLeft = Math.min(18, basePad + Math.round(cut * 0.3));
  } else if (form === "triumph") {
    // A double pennant: a dark ribbon behind, the plate in front, a star.
    const tail = Math.round(h * 0.42);
    const overhang = Math.round(h * 0.6);
    const cut = Math.max(2, Math.round(h * 0.18));
    const middle = h / 2;
    const drop = level === 0 ? 1 : Math.round(h * 0.12);
    const front: Point[] = [[cut, 0], [w - overhang, 0], [w - overhang - tail, middle], [w - overhang, h], [cut, h], [0, h - cut], [0, cut]];
    const backStart = w - overhang - tail - Math.round(h * 0.2);
    const back: Point[] = [[backStart, drop], [w, drop], [w - tail, middle], [w, h - drop], [backStart, h - drop]];
    if (level >= 1) glow(front);
    add({ ...FULL, background: `linear-gradient(180deg,${light},${dark})`, clipPath: polygon(back) });
    add({
      ...FULL,
      background: `linear-gradient(90deg,${mixColors(A, "#0b0707", 0.22)},${mixColors(A, "#0b0707", 0.5)})`,
      clipPath: polygon(insetPolygon(back, edgeWidth)),
    });
    outline(front, true, false);
    if (level >= 1) {
      const radius = h * (level >= 2 ? 0.27 : 0.3);
      const cx = w - overhang - tail - radius - Math.max(4, h * 0.14);
      star(cx, middle, radius);
      padRight = w - (cx - radius) + 6;
    } else {
      padRight = overhang + tail + 6;
    }
    padLeft = Math.min(18, basePad + Math.round(cut * 0.3));
  } else if (form === "royal_flush") {
    // An order of eight rays with guilloche rings, on a plate with pointed ends.
    const pointLeft = Math.max(3, Math.round(h * 0.26));
    const pointRight = Math.max(4, Math.round(h * 0.42));
    const middle = h / 2;
    outline(
      [[pointLeft, 0], [w - pointRight, 0], [w, middle], [w - pointRight, h], [pointLeft, h], [0, middle]],
      true,
    );
    if (level >= 1) {
      const radius = h * (level >= 2 ? 0.44 : 0.36);
      const cx = w - pointRight - radius * 0.9;
      if (level >= 2) {
        const fadeImage = `linear-gradient(90deg,transparent ${px(w - capWidth)},#000 ${px(cx - radius)})`;
        add({
          ...FULL,
          WebkitMaskImage: fadeImage,
          background: `repeating-radial-gradient(circle at ${px(cx)} 50%,${withAlpha(A, 0.32)} 0 1px,transparent 1px 4px)`,
          clipPath: polygon(innerPoints),
          maskImage: fadeImage,
        });
        const rays = starPoints(cx, middle, radius, radius * 0.62, 8);
        add({ ...FULL, background: light, clipPath: polygon(rays) }, { filter: `blur(${px(radius * 0.3)})`, opacity: 0.5 });
        add({
          ...FULL,
          background: `repeating-conic-gradient(from 0deg at ${px(cx)} 50%,${light} 0deg 3deg,${A} 3deg 7.5deg)`,
          clipPath: polygon(rays),
        });
        add({
          ...box(cx - radius * 0.38, middle - radius * 0.38, radius * 0.76, radius * 0.76),
          background: `radial-gradient(circle at 40% 35%,${mixColors(A, "#0b0707", 0.45)},${mixColors(A, "#0b0707", 0.2)})`,
          borderRadius: "50%",
          boxShadow: `0 0 0 1px ${light}`,
        });
        add({ ...box(cx - radius * 0.1, middle - radius * 0.1, radius * 0.2, radius * 0.2), background: light, borderRadius: "50%" });
        padRight = Math.max(capWidth, w - (cx - radius)) + 4;
      } else {
        add({
          ...FULL,
          background: `linear-gradient(180deg,${mixColors(A, "#ffffff", 0.35)},${A})`,
          clipPath: polygon(starPoints(cx, middle, radius, radius * 0.55, 8)),
        });
        padRight = w - (cx - radius) + 6;
      }
    } else {
      padRight = pointRight * 0.7 + 6;
    }
    padLeft = Math.min(18, basePad + Math.round(pointLeft * 0.5));
  } else if (form === "flop") {
    // A plain plate with three cards fanned at the right, like the flop on the felt.
    const corner = Math.min(6, Math.round(h * 0.2));
    add({ ...FULL, background: edgeBg, borderRadius: `${corner}px` });
    add({ ...insetBox(edgeWidth), background: bodyBg, borderRadius: `${Math.max(0, corner - 1)}px` });
    if (level >= 1) add({ ...insetBox(edgeWidth), background: gloss, borderRadius: `${Math.max(0, corner - 1)}px` });
    if (level === 0) {
      add({ ...box(w - edgeWidth - 5, edgeWidth + 2, 3, h - 2 * edgeWidth - 4), background: A, borderRadius: "1px" });
      padRight = 12;
    } else {
      const cardHeight = Math.round(h * 0.62);
      const cardWidth = Math.round(cardHeight * 0.7);
      const cx = w - Math.round(h * 0.55) - cardWidth / 2;
      const angles = level >= 2 ? [-18, 0, 18] : [-12, 12];
      const card: CSSProperties = {
        ...box(cx - cardWidth / 2, (h - cardHeight) / 2 + cardHeight * 0.06, cardWidth, cardHeight),
        borderRadius: px(Math.max(1.5, cardWidth * 0.12)),
        transformOrigin: "50% 115%",
      };
      angles.forEach((angle, index) => {
        const top = index === angles.length - 1;
        add({
          ...card,
          background: `linear-gradient(160deg,${mixColors(A, "#0b0707", top ? 0.34 : 0.2)},${mixColors(A, "#0b0707", 0.1)})`,
          boxShadow: `inset 0 0 0 1px ${top ? light : A}`,
          transform: `rotate(${angle}deg)`,
        });
        if (top) {
          add({
            ...card,
            background: `radial-gradient(circle at 50% 46%,${A} 0 ${px(cardWidth * 0.17)},transparent ${px(cardWidth * 0.17 + 0.6)})`,
            transform: `rotate(${angle}deg)`,
          });
        }
      });
      padRight = w - (cx - cardWidth * 1.3) + 6;
    }
    padLeft = basePad;
  } else if (form === "straight") {
    // An arrow: fletching cut into the left end, a head with a chevron at the right.
    const fletch = Math.max(2, Math.round(h * 0.22));
    const head = Math.max(4, Math.round(h * 0.45));
    const middle = h / 2;
    outline([[0, 0], [w - head, 0], [w, middle], [w - head, h], [0, h], [fletch, middle]], false);
    if (level >= 1) {
      const lineStart = w - capWidth;
      const top = edgeWidth + 1;
      const bottom = h - edgeWidth - 1;
      const xAt = (from: number, y: number) => w - from - (head * Math.abs(y - middle)) / middle;
      const chevron = (from: number, size: number, style: CSSProperties) =>
        add({
          ...FULL,
          ...style,
          clipPath: polygon([
            [xAt(from, top), top],
            [xAt(from, middle), middle],
            [xAt(from, bottom), bottom],
            [xAt(from + size, bottom), bottom],
            [xAt(from + size, middle), middle],
            [xAt(from + size, top), top],
          ]),
        });
      const from = Math.max(4, h * 0.16);
      const size = Math.max(1.5, h * 0.07);
      add({
        ...box(lineStart, middle - 0.6, w - from - size - 2 - lineStart, 1.2),
        background: `linear-gradient(90deg,${withAlpha(A, 0)},${light})`,
      });
      chevron(from, size, { background: A });
      if (level >= 2) chevron(from + size + 3, 1.2, { background: light, opacity: 0.7 });
      padRight = capWidth + 4;
    } else {
      padRight = head * 0.7 + 6;
    }
    padLeft = Math.min(18, basePad + Math.round(fletch * 0.5));
  } else if (form === "apc") {
    // The cup's own plate: dark blue body, a steel double frame, the monogram in rings.
    const corner = Math.min(8, Math.round(h * 0.2));
    const gap = level >= 2 ? 3 : 2;
    add({
      ...FULL,
      background: "linear-gradient(180deg,#eef3f7 0%,#9fb0c0 30%,#4a5a6a 62%,#b9c6d2 100%)",
      borderRadius: `${corner}px`,
    });
    let inset = edgeWidth;
    if (level >= 1) {
      add({ ...insetBox(edgeWidth), background: "#06182a", borderRadius: px(Math.max(0, corner - edgeWidth)) });
      add({
        ...insetBox(edgeWidth + gap - 1),
        background: "linear-gradient(180deg,#dfe7ee,#8696a6)",
        borderRadius: px(Math.max(0, corner - edgeWidth - gap + 1)),
      });
      inset = edgeWidth + gap;
    }
    const innerCorner = px(Math.max(0, corner - inset));
    add({
      ...insetBox(inset),
      background:
        "radial-gradient(120% 140% at 30% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.28) 100%),linear-gradient(90deg,#021a30 0%,#032746 65%,#04304f 100%)",
      borderRadius: innerCorner,
    });
    if (level >= 1) add({ ...insetBox(inset), background: gloss, borderRadius: innerCorner });
    const segment = (from: Point, to: Point, thickness: number, color: string) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const length = Math.hypot(dx, dy) || 1;
      const nx = ((-dy / length) * thickness) / 2;
      const ny = ((dx / length) * thickness) / 2;
      add({
        ...FULL,
        background: color,
        clipPath: polygon([
          [from[0] + nx, from[1] + ny],
          [to[0] + nx, to[1] + ny],
          [to[0] - nx, to[1] - ny],
          [from[0] - nx, from[1] - ny],
        ]),
      });
    };
    if (level >= 2) {
      const reach = h * 0.3;
      const middle = h / 2;
      const strong = "rgba(214,224,233,.6)";
      const faint = "rgba(214,224,233,.3)";
      segment([inset, middle], [inset + reach, inset], 1.2, strong);
      segment([inset, middle], [inset + reach, h - inset], 1.2, strong);
      segment([w - inset, middle], [w - inset - reach, inset], 1.2, strong);
      segment([w - inset, middle], [w - inset - reach, h - inset], 1.2, strong);
      segment([w - inset - 4, middle], [w - inset - reach - 4, inset], 1, faint);
      segment([w - inset - 4, middle], [w - inset - reach - 4, h - inset], 1, faint);
    }
    if (level >= 1) {
      const radius = h * (level >= 2 ? 0.56 : 0.5);
      const cx = w - inset - h * 0.45 - radius;
      const cy = h / 2;
      const ring = (r: number, thickness: number, color: string) => {
        const trim = Math.max(0, inset - (cy - r));
        add({
          ...box(cx - r, cy - r, 2 * r, 2 * r),
          border: `${px(thickness)} solid ${color}`,
          borderRadius: "50%",
          clipPath: `inset(${px(trim)} 0 ${px(trim)} 0)`,
        });
      };
      if (level >= 2) {
        ring(radius, 1.2, "rgba(110,130,150,.55)");
        ring(radius * 0.8, Math.max(2, h * 0.06), "#4f6276");
      } else {
        ring(radius * 0.85, 1.5, "#4f6276");
      }
      monogram = {
        ...box(cx - radius, cy - radius, 2 * radius, 2 * radius),
        fontSize: px(radius * (level >= 2 ? 0.66 : 0.72)),
      };
      padRight = w - (cx - radius) + 4;
    } else {
      padRight = 8;
    }
    padLeft = Math.min(18, basePad + (level >= 2 ? 2 : 0));
  } else if (form === "apc_second") {
    // The club's art for second place at the APC cup: both ends keep their proportions
    // and only the plain middle stretches with the row.
    const scale = h / APC_SECOND_ART.height;
    const left = Math.round(APC_SECOND_ART.left.width * scale);
    const right = Math.round(APC_SECOND_ART.right.width * scale);
    const art = (src: string): CSSProperties => ({
      backgroundImage: `url("${src}")`,
      backgroundRepeat: "no-repeat",
      backgroundSize: "100% 100%",
    });
    add({ ...box(0, 0, left, h), ...art(APC_SECOND_ART.left.src) });
    // A pixel of overlap on each side hides the seams a fractional width would leave.
    add({ ...box(left - 1, 0, w - left - right + 2, h), ...art(APC_SECOND_ART.middle) });
    add({ ...box(w - right, 0, right, h), ...art(APC_SECOND_ART.right.src) });
    padLeft = Math.min(18, Math.max(basePad, left + 2));
    padRight = right + 4;
  }

  if (champion && level >= 1 && bodyPoints) {
    layers.push({
      sheen: true,
      style: {
        ...FULL,
        backgroundImage:
          "linear-gradient(105deg,rgba(255,255,255,0) 42%,rgba(255,255,255,.16) 50%,rgba(255,255,255,0) 58%)",
        backgroundPosition: "100% 0",
        backgroundSize: "300% 100%",
        clipPath: polygon(bodyPoints),
      },
    });
  }

  return { layers, monogram, padLeft: Math.round(padLeft), padRight: Math.round(padRight) };
}
