import { Manrope, Unbounded } from "next/font/google";

// The club app's type: Unbounded for titles and numbers, Manrope for everything read.
// Both carry Cyrillic; the admin's Montserrat is loaded with Latin only, and the app's
// Russian text used to fall back to the system face. Served from our own origin by
// next/font, so Google being unreachable from a player's phone does not matter.
export const clubDisplayFont = Unbounded({
  subsets: ["cyrillic", "latin"],
  variable: "--font-club-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const clubBodyFont = Manrope({
  subsets: ["cyrillic", "latin"],
  variable: "--font-club-body",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

/**
 * The classes that put the club's type on an element: every root the app draws, the
 * layout and each portal hung on the page's body, which the layout's fonts do not reach.
 */
export const CLUB_FONT_CLASSES = `${clubDisplayFont.variable} ${clubBodyFont.variable} font-body`;
