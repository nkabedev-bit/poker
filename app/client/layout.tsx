"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, House, Swords, Trophy, User } from "lucide-react";
import { WelcomeSplash } from "./_components/welcome-splash";
import { CLUB_FONT_CLASSES } from "./fonts";
import { listenForInstallPrompt } from "./_components/install-prompt";

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
  /** Opens a link outside Telegram, in the phone's browser. */
  openLink?: (url: string) => void;
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
    selectionChanged?: () => void;
  };
  /** Bot API 6.9+: a few kilobytes per player, kept by Telegram across their devices. */
  CloudStorage?: {
    getItems: (keys: string[], callback: (error: unknown, values?: Record<string, string>) => void) => void;
    setItem: (key: string, value: string, callback?: (error: unknown, stored?: boolean) => void) => void;
  };
  isVersionAtLeast?: (version: string) => boolean;
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

/**
 * The light tick a phone gives when the player moves between tabs, tickets or sortings.
 * Telegram asks for it on a change of choice only, never on the choice being confirmed.
 */
export function tickClientSelection() {
  getClientTelegramWebApp()?.HapticFeedback?.selectionChanged?.();
}

export const ClientTMAContext = createContext<{ initData: string; telegramUser: ClientTelegramUser | null }>({
  initData: "",
  telegramUser: null,
});
export const useClientTMA = () => useContext(ClientTMAContext);

const NAV_ITEMS = [
  { href: "/client", label: "Главная", short: "Главная", icon: House, match: (p: string) => p === "/client" },
  { href: "/client/tournaments", label: "Турниры", short: "Турниры", icon: Trophy, match: (p: string) => p.includes("/tournaments") || p.includes("/events") },
  { href: "/client/battle-pass", label: "Боевой пропуск", short: "Пропуск", icon: Swords, match: (p: string) => p.includes("/battle-pass") },
  { href: "/client/profile", label: "Профиль", short: "Профиль", icon: User, match: (p: string) => p.includes("/profile") },
];

/** How long to wait for Telegram before deciding this is an ordinary browser. */
const TELEGRAM_WAIT_MS = 1200;

/** The only screen a visitor with no session is allowed to reach. */
const SIGN_IN_PATH = "/client/login";

const TELEGRAM_SESSION_FLAG = "club:opened-in-telegram";

/** A "1+1" link's pass, kept while its holder signs in. */
const DUO_INVITE_KEY = "club:duo-invite";

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

  // The tab the pill rests on. A screen outside the tab bar (the rating, somebody's
  // profile) leaves it hidden where it was, so it comes back from the last tab visited
  // rather than sliding in from the first.
  const activeTab = NAV_ITEMS.findIndex((item) => item.match(pathname));
  const [pillTab, setPillTab] = useState(Math.max(activeTab, 0));
  if (activeTab >= 0 && activeTab !== pillTab) setPillTab(activeTab);

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

  // Somebody arriving on a friend's "1+1" link has an invitation to take up, and no
  // account yet to take it up with. The pass is kept aside while they sign in — through
  // Yandex, which leaves and comes back — and spent the moment the club knows them.
  useEffect(() => {
    if (door === "loading") return;

    let token = "";
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("invite");
      if (fromUrl) window.sessionStorage.setItem(DUO_INVITE_KEY, fromUrl);
      token = fromUrl ?? window.sessionStorage.getItem(DUO_INVITE_KEY) ?? "";
    } catch {
      return;
    }

    if (!token) return;

    void fetch("/api/client-tma/duo-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData ?? "" },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        // 401 means they have yet to sign in, and the pass waits for them. Anything else
        // is an answer: taken up, already spent, or theirs to begin with.
        if (res.status === 401) return;

        try {
          window.sessionStorage.removeItem(DUO_INVITE_KEY);
        } catch {
          // Nothing to clean up in a window that refuses storage.
        }
      })
      .catch(() => {});
  }, [door, initData]);

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

  // The browser offers to install the app once, on whatever screen it decides to; the
  // offer is caught here so the home screen's hint can use it later.
  useEffect(() => listenForInstallPrompt(), []);

  return (
    <>
      {/* Installable as an app of its own (React puts these in <head>): from its icon it
          opens without Telegram, and so without a VPN. */}
      <link rel="manifest" href="/client.webmanifest" />
      <meta name="theme-color" content="#0d0a0b" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Majestic" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

      {/* Served from our own origin: Russian ISPs filter telegram.org, and the request
          hangs open rather than failing. Under "beforeInteractive" that hang held back
          every Next module behind it — the page rendered "Загрузка…" from the server and
          never hydrated, so even the give-up timer below never got to run. */}
      <Script
        src="/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={initTg}
        onReady={initTg}
      />

      <div
        className={`client-app ${CLUB_FONT_CLASSES} relative flex h-[100dvh] flex-col overflow-hidden bg-club-ink text-club-text`}
      >
        {/* Club colours: a crimson glow over the top of a near-black room. */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 -right-20 -top-[260px] h-[420px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(200,33,63,0.22),rgba(200,33,63,0))]" />
        </div>

        <header className="relative z-10 flex h-[calc(env(safe-area-inset-top)+68px)] shrink-0 items-center justify-center px-4 pt-[env(safe-area-inset-top)]">
          {pathname !== "/client" ? (
            <button
              aria-label="Назад"
              className="absolute left-4 flex h-11 w-11 items-center justify-center rounded-[14px] border border-club-line bg-white/[0.06] text-club-text transition active:scale-95"
              type="button"
              onClick={() => goBackRef.current()}
            >
              <ChevronLeft size={22} strokeWidth={2} />
            </button>
          ) : null}
          <span className="pl-[0.34em] font-display text-[13px] font-semibold tracking-[0.34em] text-club-gold">
            MAJESTIC
          </span>
        </header>

        {door === "loading" ? (
          <div className="relative z-10 flex flex-1 items-center justify-center text-club-faint">
            Загрузка…
          </div>
        ) : (
          <ClientTMAContext.Provider value={{ initData: initData ?? "", telegramUser }}>
            <main className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[calc(110px+env(safe-area-inset-bottom))]">
              {children}
            </main>

            <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-club-line bg-[rgba(18,13,15,0.96)] px-2 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-xl">
              {/* One pill slides between the tabs: a quarter of the bar wide, it moves
                  a whole tab at a time and keeps the icon's highlight centred. */}
              <span
                aria-hidden
                className={`client-nav-pill pointer-events-none absolute left-2 top-2 flex w-[calc((100%-16px)/4)] justify-center ${
                  activeTab < 0 ? "opacity-0" : ""
                }`}
                style={{ transform: `translateX(${pillTab * 100}%)` }}
              >
                <span className="h-8 w-14 rounded-full bg-club-crimson/20" />
              </span>
              {NAV_ITEMS.map((item, index) => {
                const Icon = item.icon;
                const active = index === activeTab;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    className={`relative flex flex-1 basis-0 flex-col items-center gap-1 pt-2 transition-colors duration-300 ${
                      active ? "text-club-text" : "text-club-faint"
                    }`}
                    onClick={() => {
                      if (!active) tickClientSelection();
                    }}
                  >
                    <span className={`flex h-8 w-14 items-center justify-center ${active ? "text-club-rose" : ""}`}>
                      <Icon className={active ? "client-icon-pop" : undefined} size={22} strokeWidth={active ? 2.1 : 1.8} />
                    </span>
                    <span className={`text-[11px] ${active ? "font-extrabold" : "font-semibold"}`}>{item.short}</span>
                  </Link>
                );
              })}
            </nav>

            <WelcomeSplash />
          </ClientTMAContext.Provider>
        )}
      </div>
    </>
  );
}
