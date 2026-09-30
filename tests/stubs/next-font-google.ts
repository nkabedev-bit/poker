// next/font only works inside the Next compiler; under vitest a font is its class names.
function font(options: { variable?: string } = {}) {
  return { className: "", style: { fontFamily: "" }, variable: options.variable?.replace(/^--/, "") ?? "" };
}

export const Manrope = font;
export const Unbounded = font;
