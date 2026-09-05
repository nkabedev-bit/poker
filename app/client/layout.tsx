"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, House, Trophy, User } from "lucide-react";

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

/**
 * Says something the player has to read.
 *
 * Telegram draws its own dialog, and the app used to call for it directly — which meant
 * that on the web, where there is no Telegram, every "мест не осталось" and "нет связи"
 * was thrown at a function that does not exist and vanished. The button simply stopped
 * spinning and the player was left guessing.
 */
export function showClientAlert(message: string) {
  const tg = getClientTelegramWebApp();

  if (tg?.showAlert) {
    tg.showAlert(message);
    return;
  }

  window.alert(message);
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

/** How long to wait for Telegram before deciding this is an ordinary browser. */
const TELEGRAM_WAIT_MS = 1200;

/** The only screen a visitor with no session is allowed to reach. */
const SIGN_IN_PATH = "/client/login";

const TELEGRAM_SESSION_FLAG = "club:opened-in-telegram";

function rememberTelegram() {
  try {
    window.sessionStorage.setItem(TELEGRAM_SESSION_FLAG, "1");
  } catch {
    // Private windows can refuse storage; the fragment still answers on the first screen.
  }
}

/**
 * Whether this browser really is a Telegram mini-app.
 *
 * Not "does Telegram's script exist" — it defines `Telegram.WebApp` wherever it is
 * loaded, an ordinary browser included, and taking that for an answer told every web
 * visitor they were in Telegram and left them with no way to sign in.
 *
 * What only Telegram supplies is the signed init data, and the parameters it is parsed
 * from, which sit in the URL fragment from the first paint. Reading them rather than
 * waiting for the script also keeps a player on a slow connection out of the web
 * sign-in screen, which is not a door they have.
 *
 * The fragment survives only the first screen, so the answer is kept for the visit.
 */
function isTelegramWebView() {
  if (typeof window === "undefined") return false;

  if (getClientTelegramWebApp()?.initData?.trim()) {
    rememberTelegram();
    return true;
  }

  try {
    if (window.sessionStorage.getItem(TELEGRAM_SESSION_FLAG)) return true;
  } catch {
    return window.location.hash.includes("tgWebApp");
  }

  if (window.location.hash.includes("tgWebApp")) {
    rememberTelegram();
    return true;
  }

  return false;
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [initData, setInitData] = useState<string | null>(null);
  const [telegramUser, setTelegramUser] = useState<ClientTelegramUser | null>(null);
  // Which door this visitor came through. Until it is known the screen waits: rendering
  // the app and then throwing a sign-in page at a Telegram player would be a flash of
  // the wrong thing.
  const [door, setDoor] = useState<"loading" | "telegram" | "web">("loading");
  const pathname = usePathname();
  const router = useRouter();

  const initTg = useCallback(() => {
    const tg = getClientTelegramWebApp();
    if (!tg) return;

    tg.ready();
    tg.expand();

    // The script is loaded in every browser, so its presence proves nothing. Without the
    // signed data — and without the fragment it is parsed from — this is the web, and
    // the visitor belongs at the Yandex sign-in rather than here holding a "mock".
    if (!isTelegramWebView()) return;

    setInitData(tg.initData || "mock");
    setTelegramUser(tg.initDataUnsafe?.user ?? null);
    setDoor("telegram");
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(initTg, 0);
    // Outside Telegram the script never produces a WebApp at all, and the app used to
    // sit on "Загрузка…" for good. After a moment, the web door is the answer — unless
    // this really is Telegram and its script is merely slow, which the fragment says
    // long before the script arrives.
    const giveUp = window.setTimeout(() => {
      if (isTelegramWebView()) return;
      setDoor((current) => (current === "loading" ? "web" : current));
    }, TELEGRAM_WAIT_MS);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(giveUp);
    };
  }, [initTg]);

  // A web visitor carries their session in a cookie, and there is no way to tell from
  // here whether it is still good. Asked once, rather than on every screen: every other
  // request would answer the same question a second time.
  const sessionChecked = useRef(false);

  useEffect(() => {
    if (door !== "web" || pathname === SIGN_IN_PATH || sessionChecked.current) return;
    sessionChecked.current = true;

    let cancelled = false;

    void fetch("/api/client-tma/me")
      .then((res) => {
        if (cancelled || (res.status !== 401 && res.status !== 403)) return;
        // Asked again at the last moment: Telegram's script may have arrived while the
        // request was in flight, and a player inside the mini-app has no web sign-in.
        if (isTelegramWebView()) return;

        router.replace(SIGN_IN_PATH);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [door, pathname, router]);

  // Telegram's own back button, wired the way a native screen behaves: present on every
  // screen except the home one, and pressing it returns to where the player came from.
  //
  // It used to disappear for two reasons. The effect read the Telegram SDK once, so a
  // screen opened before the script finished loading got no button at all and never
  // retried; and every navigation hid the button before showing it again, which flickers
  // between two inner screens. Subscription and visibility are separate now: the handler
  // is attached once the SDK is ready, and only visibility follows the route.
  const goBackRef = useRef(() => {});
  // Whether anything was navigated inside the app. history.length lies in a WebView —
  // it counts entries from before the app opened — so a deep link would otherwise send
  // the player back out of the mini-app instead of to the home screen.
  const navigatedRef = useRef(false);
  const firstPathRef = useRef(pathname);

  useEffect(() => {
    if (pathname !== firstPathRef.current) navigatedRef.current = true;
  }, [pathname]);

  useEffect(() => {
    goBackRef.current = () => {
      if (navigatedRef.current) {
        router.back();
        return;
      }

      router.push("/client");
    };
  }, [router]);

  useEffect(() => {
    const backButton = getClientTelegramWebApp()?.BackButton;
    if (!backButton) return;

    const handler = () => goBackRef.current();
    backButton.onClick(handler);

    return () => backButton.offClick(handler);
    // initData marks the SDK as ready: without it the button would never be wired on a
    // screen that rendered before the script loaded.
  }, [initData]);

  useEffect(() => {
    const backButton = getClientTelegramWebApp()?.BackButton;
    if (!backButton) return;

    // The app draws its own back control in the header, so Telegram's is kept hidden:
    // two "back" buttons stacked on one screen is one too many.
    backButton.hide();
  }, [initData, pathname]);

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
          {pathname !== "/client" ? (
            <button
              aria-label="Назад"
              className="absolute left-5 flex items-center gap-1 rounded-full border border-white/[0.09] bg-white/[0.06] py-1.5 pl-2 pr-3.5 text-[13px] font-semibold text-white/80 backdrop-blur-xl transition active:scale-95"
              type="button"
              onClick={() => goBackRef.current()}
            >
              <ChevronLeft size={17} /> Назад
            </button>
          ) : null}
          <span className="text-[13px] font-semibold tracking-[0.38em] text-[#e9c07a]">MAJESTIC</span>
        </header>

        {door === "loading" ? (
          <div className="relative z-10 flex flex-1 items-center justify-center text-white/40">
            Загрузка…
          </div>
        ) : (
          <ClientTMAContext.Provider value={{ initData: initData ?? "", telegramUser }}>
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
