"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  BackButton?: {
    hide: () => void;
    offClick: (handler: () => void) => void;
    onClick: (handler: () => void) => void;
    show: () => void;
  };
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
  const router = useRouter();

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

  // Telegram's own back button. Screens outside the bottom navigation (the rating, the
  // club page, achievements, medals, a tournament) have no tab of their own, so without
  // this there is no way back to where the player came from.
  useEffect(() => {
    const backButton = getClientTelegramWebApp()?.BackButton;
    if (!backButton) return;

    if (pathname === "/client") {
      backButton.hide();
      return;
    }

    const goBack = () => {
      if (window.history.length > 1) {
        router.back();
        return;
      }
      router.push("/client");
    };

    backButton.onClick(goBack);
    backButton.show();

    return () => {
      backButton.offClick(goBack);
      backButton.hide();
    };
  }, [pathname, router]);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
        onLoad={initTg}
        onReady={initTg}
      />

      <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#0a0608] text-white">
        {/* Club colours: a crimson glow bleeding into near-black felt */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 inset-x-0 h-80 rounded-full bg-[#b8163c]/20 blur-[90px]" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(200,22,63,0.14),transparent_60%)]" />
        </div>

        <header className="relative z-10 flex items-center justify-center gap-2 px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-2">
          <span className="text-[13px] font-semibold tracking-[0.38em] text-[#e9c07a]">MAJESTIC</span>
        </header>

        {!initData ? (
          <div className="relative z-10 flex flex-1 items-center justify-center text-white/40">
            Загрузка…
          </div>
        ) : (
          <ClientTMAContext.Provider value={{ initData, telegramUser }}>
            <main className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
              {children}
            </main>

            {/* A floating capsule rather than a full-width bar: the content keeps
                running underneath it, which is what makes the screen feel deep. */}
            <nav className="fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),18px)] z-20 mx-auto flex w-fit items-center gap-1 rounded-full border border-white/[0.08] bg-[#160c11]/90 p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    className={`flex h-[52px] w-[74px] items-center justify-center rounded-full transition-all ${
                      active
                        ? "bg-gradient-to-b from-[#c8163f] to-[#8d0f2b] text-white shadow-[0_8px_22px_rgba(200,22,63,0.45)]"
                        : "text-white/40"
                    }`}
                  >
                    <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
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
