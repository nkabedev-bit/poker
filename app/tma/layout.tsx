"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CircleEllipsis, Clock, CreditCard, Skull, Users } from "lucide-react";
import { canOpenScreen, type TmaRole } from "@/lib/tma/roles";
import {
  browserWebApp,
  pressBrowserMainButton,
  readBrowserMainButton,
  subscribeBrowserMainButton,
} from "./browser-webapp";
import { DeskLogin } from "./desk-login";
import { TMA_DESK_CHANGED_EVENT, TournamentClockProvider, TournamentStatusBar } from "./tournament-clock";
import "./tma.css";

export type TelegramWebApp = {
  initData?: string;
  ready: () => void;
  expand: () => void;
  // Paint Telegram's own header and the space around the app in the desk's colours, so
  // the dark screens do not sit inside a light frame. Missing on old clients.
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
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
  // Opens a t.me link inside Telegram — a player's chat — without closing the app.
  openTelegramLink?: (url: string) => void;
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

/**
 * Telegram's mini-app object inside Telegram; the browser's stand-in anywhere else, so
 * the screens work the same in a phone's browser. Telegram's script is loaded in both,
 * and only inside Telegram does it carry the signed init data.
 */
export function getTelegramWebApp(): TelegramWebApp {
  const tg = window.Telegram?.WebApp;
  return tg?.initData ? tg : browserWebApp;
}

/** The desk's own dark ground and bars, as the frame around the app should match. */
const FRAME_COLORS = { background: "#0e0f11", bar: "#1b1c1f" } as const;

/**
 * The tabs of the desk. A screen opened from one of them — the sign-ups from the room,
 * the broadcast from "Ещё" — keeps its tab lit, so the admin always knows where they are.
 */
const TABS = [
  { href: "/tma/players", icon: <Users size={22} />, label: "Зал", match: ["/players", "/signups"] },
  { href: "/tma/eliminations", icon: <Skull size={22} />, label: "Вылеты", match: ["/eliminations"] },
  { href: "/tma/cards", icon: <CreditCard size={22} />, label: "Касса", match: ["/cards"] },
  { href: "/tma/control", icon: <Clock size={22} />, label: "Турнир", match: ["/control"] },
  { href: "/tma/events", icon: <CircleEllipsis size={22} />, label: "Ещё", match: ["/events", "/bot"] },
] as const;

/**
 * The screens worked during play carry the clock on top. The tournament screen shows it
 * large itself, and the posters and the bot have nothing to do with the running game.
 */
const CLOCK_SCREENS = ["/players", "/signups", "/eliminations", "/cards"];

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
export function confirmSeated(
  name: string,
  // The label is what the dealer calls the chair — "2/3" at a short-handed table.
  at: { label?: string; seat: number; table: number },
) {
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
    tg.showAlert(`${name} посажен за стол ${at.table}, место ${at.label ?? at.seat}`, finish);
  });
}

/**
 * The role the desk is open for, "signed-out" for a browser that has not entered a
 * password yet, or null when the server could not say. The server guards every
 * endpoint on its own, so an unanswered question costs a dealer nothing worse than tabs
 * that answer "only for the floor".
 */
async function readDeskRole(initData: string): Promise<TmaRole | "signed-out" | null> {
  try {
    const res = await fetch("/api/tma/me", { headers: { "X-Telegram-Init-Data": initData } });
    if (res.status === 401 && !initData) return "signed-out";
    if (!res.ok) return null;
    const data = (await res.json()) as { role?: unknown };
    return data.role === "floor" || data.role === "dealer" ? data.role : null;
  } catch {
    return null;
  }
}

export default function TMALayout({ children }: { children: React.ReactNode }) {
  // Telegram's signed init data, or "" in a browser, where the desk cookie stands in.
  const [initData, setInitData] = useState<string | null>(null);
  const [role, setRole] = useState<TmaRole | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const inBrowser = initData === "";

  const initTg = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    if (!tg.initData) {
      setInitData("");
      return;
    }

    tg.ready();
    tg.expand();
    tg.setHeaderColor?.(FRAME_COLORS.bar);
    tg.setBackgroundColor?.(FRAME_COLORS.background);
    tg.setBottomBarColor?.(FRAME_COLORS.bar);
    setInitData(tg.initData);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(initTg, 0);
    return () => window.clearTimeout(timeout);
  }, [initTg]);

  useEffect(() => {
    if (initData === null) return;

    let cancelled = false;
    void readDeskRole(initData).then((value) => {
      if (cancelled) return;
      setSignedOut(value === "signed-out");
      setRole(value === "signed-out" ? null : value);
      setRoleChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initData]);

  const signIn = useCallback((value: TmaRole) => {
    setRole(value);
    setSignedOut(false);
  }, []);

  const signOut = useCallback(async () => {
    if (!window.confirm("Выйти из админки на этом телефоне?")) return;
    await fetch("/api/tma/session", { method: "DELETE" }).catch(() => null);
    setRole(null);
    setSignedOut(true);
  }, []);

  // A screen beyond a dealer's tables — an old link, a typed address — leads to the room.
  const screenClosed = role !== null && !canOpenScreen(role, pathname);
  useEffect(() => {
    if (screenClosed) router.replace("/tma/players");
  }, [router, screenClosed]);

  // Until the role is known, a floor's screen waits rather than greeting a dealer with
  // refusals; the room and the knockouts open straight away for everyone.
  const screenReady = role ? !screenClosed : roleChecked || canOpenScreen("dealer", pathname);
  const tabs = role === "dealer" ? TABS.filter((tab) => canOpenScreen("dealer", tab.href)) : TABS;

  return (
    <>
      {/* Our own copy: telegram.org is filtered by Russian ISPs and the request hangs
          instead of failing, which under "beforeInteractive" left the screen on
          "Loading..." for good — this one has no give-up timer at all. */}
      <Script
        src="/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={initTg}
        onReady={initTg}
      />
      
      {/* Installable as an app of its own (React puts these in <head>): from its icon
          the desk opens in the browser, without Telegram and so without a VPN. */}
      <link rel="manifest" href="/tma.webmanifest" />
      <meta name="theme-color" content={FRAME_COLORS.background} />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="Majestic Админ" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

      {initData === null || (inBrowser && !roleChecked) ? (
        <div className="tma-app flex h-screen items-center justify-center">Загрузка…</div>
      ) : inBrowser && signedOut ? (
        <div className="tma-app tma-frame">
          <main className="tma-main overflow-y-auto">
            <DeskLogin onSignedIn={signIn} />
          </main>
        </div>
      ) : (
        <TMAContext.Provider value={{ initData, role, signOut: inBrowser ? signOut : undefined }}>
          <TournamentClockProvider initData={initData} pathname={pathname}>
            <div className="tma-app tma-frame">
              {CLOCK_SCREENS.some((screen) => pathname.includes(screen)) ? (
                <TournamentStatusBar
                  onToggle={role === "dealer" ? undefined : (action) => void toggleClock(initData, action)}
                />
              ) : null}
              {/* The bar is part of the column rather than pinned to the viewport: a
                  fixed bar has to be paid for with padding on every screen, and it drifts
                  over the content whenever the keyboard resizes the window. */}
              <main className="tma-main overflow-y-auto">
                {screenReady ? children : <div className="tma-empty">Загрузка…</div>}
              </main>
              {inBrowser ? <BrowserMainButtonBar /> : null}
              <nav className="tma-nav shrink-0 pb-[env(safe-area-inset-bottom)]">
                {tabs.map((tab) => (
                  <NavItem
                    key={tab.href}
                    active={tab.match.some((part) => pathname.includes(part))}
                    href={tab.href}
                    icon={tab.icon}
                    label={tab.label}
                  />
                ))}
              </nav>
            </div>
          </TournamentClockProvider>
        </TMAContext.Provider>
      )}
    </>
  );
}

/**
 * Pauses or resumes the clock from the header. The pulse then sees the change and every
 * screen, the header included, reads it back.
 */
async function toggleClock(initData: string, action: "pause" | "start") {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback.impactOccurred("medium");

  const res = await fetch(`/api/tma/timer/${action}`, {
    method: "POST",
    headers: { "X-Telegram-Init-Data": initData },
  }).catch(() => null);

  if (!res?.ok) {
    tg?.HapticFeedback.notificationOccurred("error");
    tg?.showAlert(action === "pause" ? "Не удалось поставить паузу" : "Не удалось продолжить");
  }

  window.dispatchEvent(new Event(TMA_DESK_CHANGED_EVENT));
}

/** Telegram's big bottom button, drawn by the desk itself in a browser. */
function BrowserMainButtonBar() {
  const button = useSyncExternalStore(
    subscribeBrowserMainButton,
    readBrowserMainButton,
    readBrowserMainButton,
  );
  if (!button.visible) return null;

  return (
    <div className="tma-main-button shrink-0">
      <button
        className="tma-btn tma-btn--primary tma-btn--big"
        disabled={button.progress}
        type="button"
        onClick={pressBrowserMainButton}
      >
        {button.progress ? "Секунду…" : button.text}
      </button>
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`tma-nav__item${active ? " tma-nav__item--active" : ""}`}
      href={href}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export const TMAContext = createContext<{
  initData: string;
  role: TmaRole | null;
  // Only in a browser: inside Telegram there is nothing to sign out of.
  signOut?: () => void;
}>({
  initData: "",
  role: null,
});
export const useTMA = () => useContext(TMAContext);
