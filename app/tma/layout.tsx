"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, CalendarPlus, CreditCard, Users, Clock, Skull } from "lucide-react";

export type TelegramWebApp = {
  initData?: string;
  ready: () => void;
  expand: () => void;
  // Telegram calls back once the admin closes the alert, which is how one message can
  // be made to come before the next screen.
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
  // Telegram's own QR reader: the only camera a mini-app can open, and the reason the
  // venue cards carry a QR code rather than an NFC chip.
  showScanQrPopup?: (
    params: { text?: string },
    callback: (text: string) => boolean | void,
  ) => void;
  closeScanQrPopup?: () => void;
  HapticFeedback: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
  };
  MainButton: {
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    showProgress: () => void;
    hideProgress: () => void;
    enable?: () => void;
    disable?: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

/** Long enough to read the seat, short enough that a silent client is not a dead end. */
const SEATED_ALERT_TIMEOUT_MS = 10_000;

/**
 * Tells the desk which chair the player got, and waits for the admin to take it in.
 *
 * The seating screen closes the moment a seat is taken, and the admin was left without
 * the one thing they had just decided: they had to leave for the roster and look the
 * player up to find out where they had been sent. The seat is said out loud here
 * instead, and nothing moves on until the message has been read.
 *
 * Outside Telegram there is no alert to wait on, and the seating still has to finish —
 * so the promise settles on its own rather than hanging the desk.
 */
export function confirmSeated(name: string, at: { seat: number; table: number }) {
  const tg = getTelegramWebApp();
  if (!tg?.showAlert) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    // The player is already at the table by the time this is shown, so a client that
    // never calls back would leave the desk holding a screen that will not close over a
    // seating that actually went through. The wait gives up on its own rather than
    // stranding the queue.
    window.setTimeout(finish, SEATED_ALERT_TIMEOUT_MS);
    tg.showAlert(`${name} посажен за стол ${at.table}, место ${at.seat}`, finish);
  });
}

export default function TMALayout({ children }: { children: React.ReactNode }) {
  const [initData, setInitData] = useState<string | null>(null);
  const pathname = usePathname();

  const initTg = useCallback(() => {
    const tg = getTelegramWebApp();
    if (tg) {
      tg.ready();
      tg.expand();
      setInitData(tg.initData || "mock");
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(initTg, 0);
    return () => window.clearTimeout(timeout);
  }, [initTg]);

  return (
    <>
      <Script 
        src="https://telegram.org/js/telegram-web-app.js" 
        strategy="beforeInteractive" 
        onLoad={initTg}
        onReady={initTg}
      />
      
      {!initData ? (
        <div className="flex items-center justify-center h-screen bg-black text-[var(--tg-theme-text-color,#fff)]">
          Loading...
        </div>
      ) : (
        <TMAContext.Provider value={{ initData }}>
          <div className="flex flex-col h-[100dvh] bg-[var(--tg-theme-bg-color,#000)] text-[var(--tg-theme-text-color,#fff)]">
            {/* The bar is part of the column rather than pinned to the viewport: a
                fixed bar has to be paid for with padding on every screen, and it drifts
                over the content whenever the keyboard resizes the window. */}
            <main className="flex-1 overflow-y-auto p-4 pb-6">
              {children}
            </main>
            <nav className="flex h-16 shrink-0 items-center justify-around border-t border-[var(--tg-theme-hint-color,rgba(255,255,255,0.1))] bg-[var(--tg-theme-secondary-bg-color,#1c1c1e)] pb-[env(safe-area-inset-bottom)] [height:calc(4rem+env(safe-area-inset-bottom))]">
              <NavItem href="/tma/players" icon={<Users />} label="Игроки" active={pathname.includes("/players")} />
              <NavItem href="/tma/control" icon={<Clock />} label="Управление" active={pathname.includes("/control")} />
              <NavItem href="/tma/eliminations" icon={<Skull />} label="Выбывания" active={pathname.includes("/eliminations")} />
              <NavItem href="/tma/cards" icon={<CreditCard />} label="Карты" active={pathname.includes("/cards")} />
              <NavItem href="/tma/events" icon={<CalendarPlus />} label="Афиши" active={pathname.includes("/events")} />
              <NavItem href="/tma/bot" icon={<Bot />} label="Тг бот" active={pathname.includes("/bot")} />
            </nav>
          </div>
        </TMAContext.Provider>
      )}
    </>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${active ? "text-[var(--tg-theme-button-color,#3390ec)]" : "text-[var(--tg-theme-hint-color,#8e8e93)]"}`}>
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  );
}

export const TMAContext = createContext<{ initData: string }>({ initData: "" });
export const useTMA = () => useContext(TMAContext);
