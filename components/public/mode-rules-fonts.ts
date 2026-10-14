import { Manrope, Unbounded } from "next/font/google";

// The club deck's type on the hall's screen: Unbounded for the names and the numbers,
// Manrope for the lines read. Heavier than the mini-app's cut — the slide's title is
// read from the far end of the room. Served from our own origin by next/font.
const modeRulesDisplayFont = Unbounded({
  subsets: ["cyrillic", "latin"],
  variable: "--font-mode-rules-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

const modeRulesBodyFont = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-mode-rules-body",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const MODE_RULES_FONT_CLASSES = `${modeRulesDisplayFont.variable} ${modeRulesBodyFont.variable}`;
