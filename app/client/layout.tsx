"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Ticket, Trophy } from "lucide-react";

export type ClientTelegramWebApp = {
  initData?: string;
  ready: () => void;
  expand: () => void;
  showAlert: (message: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
  };
};

export function getClientTelegramWebApp(): ClientTelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: ClientTelegramWebApp } }).Telegram?.WebApp;
}

export const ClientTMAContext = createContext<{ initData: string }>({ initData: "" });
export const useClientTMA = () => useContext(ClientTMAContext);

const NAV_ITEMS = [
  { href: "/client", label: "Регистрация", icon: Ticket, match: (p: string) => p === "/client" },
  { href: "/client/achievements", label: "Достижения", icon: Trophy, match: (p: string) => p.includes("/achievements") },
  { href: "/client/schedule", label: "Расписание", icon: CalendarDays, match: (p: string) => p.includes("/schedule") },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [initData, setInitData] = useState<string | null>(null);
  const pathname = usePathname();

  const initTg = useCallback(() => {
    const tg = getClientTelegramWebApp();
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

      <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#0a0f0c] text-white">
        {/* Ambient felt glow */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-700/30 blur-3xl" />
          <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_55%)]" />
        </div>

        <header className="relative z-10 flex items-center justify-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3">
          <span className="text-base font-semibold tracking-[0.32em] text-amber-300/90">MAJESTIC</span>
          <span className="text-base">♠</span>
        </header>

        {!initData ? (
          <div className="relative z-10 flex flex-1 items-center justify-center text-amber-200/70">
            Загрузка…
          </div>
        ) : (
          <ClientTMAContext.Provider value={{ initData }}>
            <main className="relative z-10 flex-1 overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom)+12px)]">
              {children}
            </main>

            <nav className="fixed inset-x-0 bottom-0 z-20 flex h-[calc(4.75rem+env(safe-area-inset-bottom))] items-start justify-around border-t border-white/10 bg-[#0b120d]/90 px-2 pt-2 backdrop-blur-xl">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl py-1.5 transition-colors ${
                      active ? "text-amber-300" : "text-white/45"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                        active ? "bg-amber-300/15 shadow-[0_0_18px_rgba(251,191,36,0.25)]" : ""
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
