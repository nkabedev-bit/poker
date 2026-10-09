"use client";

import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CLUB_FONT_CLASSES } from "../fonts";
import { GhostButton, PrimaryButton } from "./ui";
import {
  describeNicknameRefusal,
  NICKNAME_CHANGE_COOLDOWN_DAYS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
} from "@/lib/players/nickname-change";

/**
 * The player's own way to a new nickname. The club allows one change a month, so while
 * the last change is fresh the sheet only says when the next one opens.
 */
export function NicknameEditor({
  availableAt,
  current,
  onClose,
  onSave,
}: {
  /** When the next change opens; null when the nickname may be changed now. */
  availableAt: string | null;
  current: string;
  onClose: () => void;
  /** Stores the nickname; answers why the club turned it down, or null once it is saved. */
  onSave: (nickname: string) => Promise<string | null>;
}) {
  const [nickname, setNickname] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const typed = nickname.trim().replace(/\s+/g, " ");
  const changed = typed.length >= NICKNAME_MIN_LENGTH && typed !== current.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed || saving) return;

    setSaving(true);
    setError("");
    try {
      const refusal = await onSave(typed);
      if (refusal) setError(refusal);
    } finally {
      setSaving(false);
    }
  };

  // Drawn on the page's body for the same reason as the favourite hand: the menu at the
  // bottom of the app would otherwise sit on top of the buttons.
  return createPortal(
    <div
      aria-label="Сменить ник"
      aria-modal="true"
      className={`client-app ${CLUB_FONT_CLASSES} fixed inset-0 z-50 flex items-end justify-center bg-[rgba(5,3,4,0.72)] backdrop-blur-sm sm:items-center sm:px-4`}
      role="dialog"
    >
      <form
        className="client-sheet-up flex max-h-[92dvh] w-full max-w-[420px] flex-col gap-[18px] overflow-y-auto rounded-t-[28px] border-t border-club-line bg-[#151012] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2.5 text-club-text sm:rounded-[28px] sm:border sm:pb-5 md:p-7 md:shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        onSubmit={(event) => void submit(event)}
      >
        <span aria-hidden className="h-[5px] w-10 self-center rounded-full bg-white/[0.18] md:hidden" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint">Профиль</div>
            <div className="font-display text-[20px] font-semibold md:text-[22px]">Сменить ник</div>
          </div>
          <button
            aria-label="Закрыть"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-club-line bg-white/[0.06]"
            type="button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {availableAt ? (
          <>
            <p className="text-[14px] leading-relaxed text-club-muted">
              {describeNicknameRefusal("cooldown", availableAt)}
            </p>
            <GhostButton type="button" onClick={onClose}>
              Понятно
            </GhostButton>
          </>
        ) : (
          <>
            {/* A label is a grid with an 8px gap by the global style. */}
            <label className="min-w-0">
              <span className="text-[13px] font-bold text-club-text">Новый ник</span>
              <input
                autoComplete="off"
                autoFocus
                className="h-[52px] w-full rounded-[14px] border border-club-line bg-club-surface px-4 text-[15px] font-semibold text-club-text outline-none placeholder:font-medium placeholder:text-club-faint focus:border-club-rose"
                maxLength={NICKNAME_MAX_LENGTH}
                placeholder="Ваш игровой ник"
                value={nickname}
                onChange={(event) => {
                  setNickname(event.target.value);
                  setError("");
                }}
              />
              <span className="text-[12px] leading-relaxed text-club-muted">
                От {NICKNAME_MIN_LENGTH} до {NICKNAME_MAX_LENGTH} символов. Ник сменится везде: в
                рейтинге, истории игр и наградах. Следующая смена — через{" "}
                {NICKNAME_CHANGE_COOLDOWN_DAYS} дней.
              </span>
            </label>

            {error ? <div className="text-center text-sm text-club-rose">{error}</div> : null}

            <div className="flex flex-col gap-2 md:flex-row-reverse md:gap-2.5">
              <PrimaryButton className="md:flex-1" disabled={!changed} loading={saving} type="submit">
                Сохранить
              </PrimaryButton>
              <GhostButton className="md:flex-1" disabled={saving} type="button" onClick={onClose}>
                Отмена
              </GhostButton>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}
