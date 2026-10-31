import { Bebas_Neue, Montserrat } from "next/font/google";

// The hall clock's type: Bebas Neue for the numbers — tall and narrow, so a blind of five
// digits still reads from the far tables — and Montserrat for the words. Bebas has no
// Cyrillic, so every word on the board is set in Montserrat. Served by next/font.
const timerDigitsFont = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-timer-digits",
  weight: "400",
  display: "swap",
});

const timerTextFont = Montserrat({
  subsets: ["cyrillic", "latin"],
  variable: "--font-timer-text",
  weight: ["600", "700", "800"],
  display: "swap",
});

export const TIMER_FONT_CLASSES = `${timerDigitsFont.variable} ${timerTextFont.variable}`;
