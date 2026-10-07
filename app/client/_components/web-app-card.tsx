"use client";

import { useState } from "react";
import { ChevronRight, Loader2, Smartphone } from "lucide-react";
import { getClientTelegramWebApp, showClientAlert, useClientTMA } from "../layout";
import { Eyebrow, IconTile } from "./ui";

/**
 * The mini-app's invitation to the web app, dressed as one of the club's announcements.
 *
 * It asks the server for a pass that names this player, then opens the club's site in the
 * phone's browser with it: there the player signs in with Yandex and lands in their own
 * profile, and can put the app on the home screen to open it without Telegram or a VPN.
 */
export function WebAppCard() {
  const { initData } = useClientTMA();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/client-tma/web-link", {
        method: "POST",
        headers: { "X-Telegram-Init-Data": initData },
      });
      const { token } = (await response.json().catch(() => ({}))) as { token?: string };
      if (!response.ok || !token) throw new Error("no pass");

      const url = `${window.location.origin}/client/login?link=${encodeURIComponent(token)}`;
      const tg = getClientTelegramWebApp();
      if (tg?.openLink) tg.openLink(url);
      else window.open(url, "_blank", "noopener");
    } catch {
      showClientAlert("Не получилось открыть сайт. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className="flex w-full items-center gap-3.5 rounded-[20px] border border-club-gold/30 bg-club-gold/[0.08] px-4 py-3.5 text-left transition-transform active:scale-[0.98]"
      type="button"
      onClick={() => void open()}
    >
      <IconTile className="!bg-club-gold/15">
        <Smartphone size={20} />
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Eyebrow className="!text-club-gold">Объявление клуба</Eyebrow>
        <p className="text-[14px] leading-snug">
          Добавьте Majestic на главный экран и доступ к приложению будет даже без VPN
        </p>
      </div>
      {busy ? (
        <Loader2 className="shrink-0 animate-spin text-club-gold" size={18} />
      ) : (
        <ChevronRight className="shrink-0 text-club-gold" size={18} />
      )}
    </button>
  );
}
