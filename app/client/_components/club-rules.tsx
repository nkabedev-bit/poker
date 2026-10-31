"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, ScrollText } from "lucide-react";
import { CLUB_FONT_CLASSES } from "../fonts";
import { getClientTelegramWebApp, showClientAlert } from "../layout";
import { GhostButton, PrimaryButton } from "./ui";
import { CLUB_RULES_URL } from "@/lib/client/club-rules";

/**
 * Opens the rules PDF outside the app.
 *
 * Inside Telegram the mini-app's own window has no way back from a PDF, so the file goes
 * to the phone's browser; on the web it gets a tab of its own.
 */
export function openClubRules(inTelegram: boolean) {
  const url = new URL(CLUB_RULES_URL, window.location.origin).href;
  const tg = getClientTelegramWebApp();
  tg?.HapticFeedback?.impactOccurred("light");

  if (inTelegram && tg?.openLink) {
    tg.openLink(url);
    return;
  }

  window.open(url, "_blank", "noopener");
}

/**
 * The reminder a player meets before anything else: disputes are settled by the club's
 * rules. It closes only once they tick «С правилами ознакомлен», and the tick is stored,
 * so it does not come back until the rules change.
 */
export function ClubRulesSheet({
  initData,
  onAccepted,
}: {
  initData: string;
  onAccepted: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (!agreed || saving) return;

    setSaving(true);
    try {
      const res = await fetch("/api/client-tma/rules", {
        headers: { "X-Telegram-Init-Data": initData },
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        showClientAlert(body?.message ?? "Не получилось сохранить. Попробуйте ещё раз.");
        return;
      }

      onAccepted();
    } catch {
      showClientAlert("Нет связи с клубом. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  };

  // Drawn on the page's body: the menu at the bottom of the app would otherwise sit on
  // top of the buttons. Under the welcome a newcomer sees first, which sits a layer higher.
  return createPortal(
    <div
      aria-label="Правила клуба"
      aria-modal="true"
      className={`client-app ${CLUB_FONT_CLASSES} fixed inset-0 z-40 flex items-end justify-center bg-[rgba(5,3,4,0.72)] backdrop-blur-sm sm:items-center sm:px-4`}
      role="dialog"
    >
      <div className="client-sheet-up flex max-h-[92dvh] w-full max-w-[440px] flex-col gap-[18px] overflow-y-auto rounded-t-[28px] border-t border-club-line bg-[#151012] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 text-club-text sm:rounded-[28px] sm:border sm:pb-5 md:p-7 md:shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-club-gold/[0.12] text-club-gold">
            <ScrollText size={24} />
          </span>
          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">Памятка</div>
            <div className="font-display text-[20px] font-semibold md:text-[22px]">Правила клуба</div>
          </div>
        </div>

        <p className="text-[14px] leading-relaxed text-club-muted">
          Перед игрой ознакомьтесь с правилами турниров MAJESTIC.{" "}
          <span className="font-semibold text-club-text">
            В спорных ситуациях клуб руководствуется этими правилами.
          </span>
        </p>

        <GhostButton type="button" onClick={() => openClubRules(Boolean(initData))}>
          <FileText size={18} />
          Открыть правила (PDF)
        </GhostButton>

        {/* The global style makes a label a grid, so the box and the words sit in a flex
            row of their own inside it. */}
        <label className="cursor-pointer rounded-2xl border border-club-line bg-club-surface p-3.5">
          <div className="flex items-center gap-3">
            <input
              checked={agreed}
              className="peer sr-only"
              type="checkbox"
              onChange={(event) => setAgreed(event.target.checked)}
            />
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-club-rose ${
                agreed ? "bg-club-crimson text-white" : "border-2 border-club-faint"
              }`}
            >
              {agreed ? <Check size={15} strokeWidth={3} /> : null}
            </span>
            <span className="text-[14px] font-semibold text-club-text">С правилами ознакомлен</span>
          </div>
        </label>

        <PrimaryButton disabled={!agreed} loading={saving} type="button" onClick={() => void accept()}>
          Продолжить
        </PrimaryButton>
      </div>
    </div>,
    document.body,
  );
}
