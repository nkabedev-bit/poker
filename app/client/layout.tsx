"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Trophy, User } from "lucide-react";

export type ClientTelegramUser = {
  first_name?: string;
  id?: number;
  last_name?: string;
  photo_url?: string;
  username?: string;
};

export type ClientTelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: ClientTelegramUser };
  ready: () => void;
  expand: () => void;
  openTelegramLink?: (url: string) => void;
  showAlert: (message: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
  };
};

export function getClientTelegramWebApp(): ClientTelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: ClientTelegramWebApp } }).Telegram?.WebApp;
}

export const ClientTMAContext = createContext<{ initData: string; telegramUser: ClientTelegramUser | null }>({
  initData: "",
  telegramUser: null,
});
export const useClientTMA = () => useContext(ClientTMAContext);

const NAV_ITEMS = [
  { href: "/client", label: "Главная", icon: House, match: (p: string) => p === "/client" },
  { href: "/client/tournaments", label: "Турниры", icon: Trophy, match: (p: string) => p.includes("/tournaments") || p.includes("/events") },
  { href: "/client/profile", label: "Профиль", icon: User, match: (p: string) => p.includes("/profile") },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [initData, setInitData] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<ClientTelegramUser | null>(null);
  const pathname = usePathname();

  const initTg = useCallback(() => {
    const tg = getClientTelegramWebApp();
    if (tg) {
      tg.ready();
      tg.expand();
      setInitData(tg.initData || "mock");
      setTelegramUser(tg.initDataUnsafe?.user ?? null);
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

      <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#0b0708] text-white">
        {/* Club colours: deep crimson glow over near-black felt */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#b8163c]/25 blur-3xl" />
          <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-[#7d0d26]/25 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(184,22,60,0.12),transparent_55%)]" />
        </div>

        <header className="relative z-10 flex items-center justify-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
          <span className="text-base font-semibold tracking-[0.32em] text-[#e8b465]">MAJESTIC</span>
          <span className="text-base">♠</span>
        </header>

        {!initData ? (
          <div className="relative z-10 flex flex-1 items-center justify-center text-white/50">
            Загрузка…
          </div>
        ) : (
          <ClientTMAContext.Provider value={{ initData, telegramUser }}>
            <main className="relative z-10 flex-1 overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom)+12px)]">
              {children}
            </main>

            <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-white/10 bg-[#120a0d]/90 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),14px)] backdrop-blur-xl">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors ${
                      active ? "text-[#f05a7e]" : "text-white/45"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                        active ? "bg-[#b8163c]/20 shadow-[0_0_18px_rgba(184,22,60,0.35)]" : ""
                      }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                    </span>
                    <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </ClientTMAContext.Provider>
        )}
      </div>
    </>
  );
}
