"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Users, Clock, Skull } from "lucide-react";

export type TelegramWebApp = {
  initData?: string;
  ready: () => void;
  expand: () => void;
  showAlert: (message: string) => void;
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
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
            <main className="flex-1 overflow-y-auto pb-[calc(6rem+env(safe-area-inset-bottom)+8px)] p-4">
              {children}
            </main>
            <nav className="fixed bottom-[calc(env(safe-area-inset-bottom)+8px)] left-0 right-0 h-16 bg-[var(--tg-theme-secondary-bg-color,#1c1c1e)] border-t border-[var(--tg-theme-hint-color,rgba(255,255,255,0.1))] flex justify-around items-center">
              <NavItem href="/tma/players" icon={<Users />} label="Игроки" active={pathname.includes("/players")} />
              <NavItem href="/tma/control" icon={<Clock />} label="Управление" active={pathname.includes("/control")} />
              <NavItem href="/tma/eliminations" icon={<Skull />} label="Выбывания" active={pathname.includes("/eliminations")} />
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
