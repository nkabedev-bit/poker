"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Share, Smartphone, SquarePlus, X } from "lucide-react";
import {
  chooseInstallHint,
  INSTALL_HINT_DISMISSED_KEY,
  isHintSnoozed,
  isIosDevice,
  type InstallHint,
} from "@/lib/pwa/install-hint";
import { getClientTelegramWebApp, useClientTMA } from "../layout";
import { askToInstall, getInstallPrompt, subscribeToInstallPrompt } from "./install-prompt";
import { PrimaryButton } from "./ui";

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
 * The home screen's offer to put the club on the phone.
 *
 * Installed, the app opens straight from its icon in a browser of its own — no Telegram,
 * so no VPN — and signs in with Yandex. Inside the mini-app the offer sends the player
 * out to a browser first, since only a browser can install it.
 */
export function InstallBanner() {
  const { initData } = useClientTMA();
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

  if (hint === "none") return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, String(Date.now()));
    } catch {
      // Without storage the hint simply comes back next visit.
    }
    setHint("none");
  };

  const openInBrowser = () => {
    const url = `${window.location.origin}/client`;
    const tg = getClientTelegramWebApp();
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank", "noopener");
  };

  return (
    <div className="relative flex flex-col gap-3 rounded-[20px] border border-club-line bg-club-surface p-4">
      <button
        aria-label="Закрыть"
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full text-club-muted transition active:scale-95"
        type="button"
        onClick={dismiss}
      >
        <X size={18} />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <Smartphone className="mt-0.5 shrink-0 text-club-rose" size={22} />
        <div className="flex flex-col gap-1">
          <p className="text-[16px] font-extrabold">Приложение клуба на экране телефона</p>
          <p className="text-[13px] text-club-muted">
            {hint === "telegram"
              ? "Открывается одной кнопкой и работает без VPN и без Telegram. Откроем сайт в браузере — добавьте его на экран, откройте с иконки и войдите через Яндекс."
              : "Открывается одной кнопкой и работает без VPN и без Telegram."}
          </p>
        </div>
      </div>

      {hint === "telegram" ? (
        <>
          <PrimaryButton type="button" onClick={openInBrowser}>
            <ExternalLink size={18} /> Открыть в браузере
          </PrimaryButton>
          <p className="text-[12px] text-club-muted">
            Если сайт откроется внутри Telegram — нажмите «Открыть в браузере» в его меню.
          </p>
        </>
      ) : null}

      {hint === "prompt" ? (
        <PrimaryButton type="button" onClick={() => void askToInstall()}>
          <SquarePlus size={18} /> Установить
        </PrimaryButton>
      ) : null}

      {hint === "ios" ? (
        <p className="text-[14px] leading-relaxed">
          Нажмите «Поделиться» <Share aria-hidden className="inline align-[-3px]" size={16} /> в браузере,
          затем «На экран „Домой“» <SquarePlus aria-hidden className="inline align-[-3px]" size={16} />.
          Входите через Яндекс уже в приложении с иконки — iPhone хранит вход там отдельно от браузера.
        </p>
      ) : null}

      {hint === "menu" ? (
        <p className="text-[14px] leading-relaxed">
          Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».
        </p>
      ) : null}
    </div>
  );
}
