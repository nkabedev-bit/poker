"use client";

import { useState, type FormEvent } from "react";
import { isIosDevice } from "@/lib/pwa/install-hint";
import type { TmaRole } from "@/lib/tma/roles";
import { ScreenHeader } from "./ui";

/**
 * The way into the desk from a phone's browser, where Telegram cannot say who is asking.
 *
 * One field: the password itself decides the role, the floors' opening everything and
 * the dealers' the room and the knockouts. The two passwords are set in the admin bot
 * with /webpass.
 */
export function DeskLogin({ onSignedIn }: { onSignedIn: (role: TmaRole) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tma/session", {
        body: JSON.stringify({ password }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; role?: TmaRole };

      if (!res.ok || !data.role) {
        setError(data.error ?? "Не удалось войти");
        return;
      }

      setPassword("");
      onSignedIn(data.role);
    } catch {
      setError("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="tma-screen tma-screen--centered" onSubmit={(event) => void submit(event)}>
      <ScreenHeader title="Вход в админку" />
      <label className="tma-field" htmlFor="desk-password">
        <span className="tma-field__label">Пароль</span>
        <input
          autoComplete="current-password"
          id="desk-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error ? <p className="tma-danger-text">{error}</p> : null}
      <button className="tma-btn tma-btn--primary tma-btn--big" disabled={!password || busy} type="submit">
        {busy ? "Входим…" : "Войти"}
      </button>
      <p className="tma-hint tma-hint--pad">
        Пароль флора открывает всю админку, пароль дилера — «Зал» и «Вылеты». Вход держится 30 дней.
      </p>
      <InstallHint />
    </form>
  );
}

/** How to keep the desk on the home screen, unless it is already opened from there. */
function InstallHint() {
  const [hint] = useState(() => {
    if (typeof window === "undefined") return null;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return null;
    return isIosDevice(navigator.userAgent, navigator.maxTouchPoints)
      ? "Чтобы открывать с иконки: «Поделиться» → «На экран „Домой“»."
      : "Чтобы открывать с иконки: меню браузера → «Установить приложение» или «Добавить на главный экран».";
  });

  if (!hint) return null;
  return <p className="tma-hint tma-hint--pad">{hint} С иконки войдите ещё раз — телефон хранит вход отдельно.</p>;
}
