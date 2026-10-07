"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Share, SquarePlus, X } from "lucide-react";
import {
  chooseInstallHint,
  INSTALL_HINT_DISMISSED_KEY,
  isHintSnoozed,
  isIosDevice,
  type InstallHint,
} from "@/lib/pwa/install-hint";
import { useClientTMA } from "../layout";
import { askToInstall, getInstallPrompt, subscribeToInstallPrompt } from "./install-prompt";

/** Screens of a visitor who is not in yet: nothing to put on a home screen so far. */
const NOT_SIGNED_IN_PATHS = ["/client/login", "/client/link", "/client/onboarding"];

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function readDismissed() {
  try {
    return isHintSnoozed(window.localStorage.getItem(INSTALL_HINT_DISMISSED_KEY), Date.now());
  } catch {
    return false;
  }
}

/**
 * The note along the bottom of the web app on how to put it on the home screen.
 *
 * Shown to a signed-in player in a browser: installed, the app opens from its icon with no
 * Telegram and no VPN. Inside the mini-app the club's card on the home screen does the
 * asking instead, and inside the installed app there is nothing left to ask.
 */
export function InstallBanner() {
  const { initData } = useClientTMA();
  const pathname = usePathname();
  const [hint, setHint] = useState<InstallHint>("none");

  useEffect(() => {
    const decide = () =>
      setHint(
        chooseInstallHint({
          canPrompt: getInstallPrompt() !== null,
          dismissed: readDismissed(),
          inTelegram: initData.length > 0,
          isIos: isIosDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0),
          standalone: isStandalone(),
        }),
      );

    decide();
    return subscribeToInstallPrompt(decide);
  }, [initData]);

  // The mini-app has its own card for this; here only a browser is asked.
  if (hint === "none" || hint === "telegram" || NOT_SIGNED_IN_PATHS.includes(pathname)) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Without storage the note simply comes back next visit.
    }
    setHint("none");
  };

  return (
    <div className="client-sheet-up fixed inset-x-3 bottom-[calc(80px+env(safe-area-inset-bottom))] z-20 flex items-start gap-3 rounded-[18px] border border-club-gold/30 bg-[rgba(30,22,18,0.97)] p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-[14px] font-extrabold">Добавьте Majestic на экран телефона</p>
        {hint === "ios" ? (
          <p className="text-[13px] leading-relaxed text-club-muted">
            Нажмите «Поделиться» <Share aria-hidden className="inline align-[-3px]" size={15} />, затем
            «На экран „Домой“» <SquarePlus aria-hidden className="inline align-[-3px]" size={15} />. Нет такого
            пункта — значит, сайт открылся внутри Telegram: сначала откройте его в Safari. Потом зайдите в
            приложение с иконки и войдите через тот же Яндекс.
          </p>
        ) : null}
        {hint === "menu" ? (
          <p className="text-[13px] leading-relaxed text-club-muted">
            Нажмите ⋮ в браузере и выберите «Установить приложение» или «Добавить на главный экран». Нет
            такого пункта — значит, сайт открылся внутри Telegram: сначала выберите «Открыть в Chrome» или
            «Открыть в браузере».
          </p>
        ) : null}
        {hint === "prompt" ? (
          <button
            className="mt-1 flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-club-crimson px-4 text-[14px] font-extrabold text-white transition active:scale-[0.985]"
            type="button"
            onClick={() => void askToInstall()}
          >
            <SquarePlus size={17} /> Установить приложение
          </button>
        ) : null}
      </div>
      <button
        aria-label="Закрыть"
        className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-club-muted transition active:scale-95"
        type="button"
        onClick={dismiss}
      >
        <X size={17} />
      </button>
    </div>
  );
}
