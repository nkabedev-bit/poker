"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

/** Left by the questionnaire for the home screen it hands the newcomer over to. */
const WELCOME_KEY = "club:welcome";

/** How long the welcome holds the screen before the home screen takes over. */
const WELCOME_MS = 1800;

/** Called as the questionnaire goes through: the home screen greets the newcomer. */
export function rememberWelcome() {
  try {
    window.sessionStorage.setItem(WELCOME_KEY, "1");
  } catch {
    // A window that refuses storage simply skips the greeting.
  }
}

function readWelcome() {
  if (typeof window === "undefined") return false;

  try {
    return window.sessionStorage.getItem(WELCOME_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The newcomer's first second in the club: a check drawn in the club's red and a word of
 * welcome, then the home screen. The questionnaire used to drop them onto it mid-stride,
 * with nothing to say the form had gone through.
 */
export function WelcomeSplash() {
  const [shown, setShown] = useState(readWelcome);

  useEffect(() => {
    if (!shown) return;

    try {
      window.sessionStorage.removeItem(WELCOME_KEY);
    } catch {
      // Nothing to clear in a window that refuses storage.
    }

    const timer = window.setTimeout(() => setShown(false), WELCOME_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;

  // Drawn on the page's body, over the tab bar, which sits in a stacking layer of its own.
  return createPortal(
    <div
      className="client-app client-welcome fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#0a0608]/95 px-8 text-center text-white"
      role="status"
    >
      <span className="client-pop-in flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-[#c8163f] to-[#7d0d26] shadow-[0_14px_40px_rgba(200,22,63,0.45)]">
        <Check className="client-check-draw" size={38} strokeWidth={3} />
      </span>
      <div className="flex flex-col gap-1.5">
        <div className="text-[22px] font-bold tracking-tight">Добро пожаловать в Majestic</div>
        <div className="text-sm text-white/55">Анкета сохранена — запись на турниры открыта.</div>
      </div>
    </div>,
    document.body,
  );
}
