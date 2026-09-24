"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Phone, Send } from "lucide-react";
import { getTelegramWebApp, useTMA } from "./layout";

/** The questionnaire as /api/tma/client-profile hands it over. */
type ClientProfile = {
  birthDate: string;
  discoverySource: string;
  displayName: string | null;
  freeEntries: { regular: number; vip: number };
  fullName: string;
  notificationsConsent: boolean;
  phone: string;
  ratingConsent: boolean;
  submittedAt: string | null;
  telegramId?: number | null;
  username: string | null;
};

/** The answer that came back, and which player it was asked for. */
type LoadedProfile = { profile: ClientProfile | null; query: string };

/**
 * Opens the player's chat inside Telegram; outside it — a browser, an old client — a new
 * tab still gets the admin there.
 */
function openTelegramChat(username: string) {
  const url = `https://t.me/${encodeURIComponent(username)}`;
  const tg = getTelegramWebApp();
  tg?.HapticFeedback.impactOccurred("light");

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }

  window.open(url, "_blank", "noopener");
}

/** The number to dial: the digits and the plus, whatever the player typed around them. */
function buildPhoneHref(phone: string) {
  const dialable = phone.replace(/[^\d+]/g, "");
  return /\d/.test(dialable) ? `tel:${dialable}` : undefined;
}

/**
 * The questionnaire a player filled in when they joined, looked up by the account behind
 * them. The desk opens it to reach somebody — a sign-up running late, a player who left
 * without settling — so the phone and the username are links rather than text to copy.
 */
export function ClientProfileCard({
  accountId,
  className,
  telegramId,
}: {
  accountId: string | null;
  /** The box the answers sit in, which depends on the screen around it. */
  className: string;
  telegramId: number | null;
}) {
  const { initData } = useTMA();
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null);
  // A player who joined through the web has no Telegram id at all, so the account is
  // what the questionnaire is asked for by; the id is the fallback for older seats.
  const query = accountId
    ? `userId=${encodeURIComponent(accountId)}`
    : telegramId
      ? `telegramId=${telegramId}`
      : "";

  useEffect(() => {
    if (!query) return;

    // The desk can close one player and open the next before the first answer is back,
    // and a late answer must not put somebody else's phone under this name.
    let current = true;
    void fetch(`/api/tma/client-profile?${query}`, {
      headers: { "X-Telegram-Init-Data": initData },
    })
      .then(async (res) => (res.ok ? ((await res.json()).profile ?? null) : null))
      .catch(() => null)
      .then((profile: ClientProfile | null) => {
        if (current) setLoaded({ profile, query });
      });

    return () => {
      current = false;
    };
  }, [initData, query]);

  if (!query) {
    return (
      <p className="text-sm text-[var(--tg-theme-hint-color)]">
        Игрок не привязан к аккаунту клуба — анкеты нет.
      </p>
    );
  }

  if (loaded?.query !== query) {
    return <p className="text-sm text-[var(--tg-theme-hint-color)]">Открываем анкету…</p>;
  }

  const { profile } = loaded;
  if (!profile) {
    return (
      <p className="text-sm text-[var(--tg-theme-hint-color)]">
        Анкета не найдена — игрок регистрировался до появления анкет.
      </p>
    );
  }

  const username = profile.username;
  const knownTelegramId = profile.telegramId ?? telegramId;

  return (
    <div className={`space-y-2 ${className}`}>
      <ProfileRow label="Имя и фамилия" value={profile.fullName} />
      <ProfileRow label="Ник в клубе" value={profile.displayName ?? ""} />
      <ProfileRow
        href={buildPhoneHref(profile.phone)}
        icon={<Phone size={14} />}
        label="Телефон"
        value={profile.phone}
      />
      <ProfileRow label="Дата рождения" value={profile.birthDate} />
      <ProfileRow label="Откуда узнал" value={profile.discoverySource} />
      <ProfileRow
        icon={<Send size={14} />}
        label="Telegram"
        onOpen={username ? () => openTelegramChat(username) : undefined}
        value={
          username
            ? `@${username}`
            : knownTelegramId
              ? `id ${knownTelegramId}`
              : "нет — вход через Яндекс"
        }
      />
      <ProfileRow label="Согласие на рейтинг" value={profile.ratingConsent ? "Да" : "Нет"} />
      <ProfileRow
        label="Согласие на рассылку"
        value={profile.notificationsConsent ? "Да" : "Нет"}
      />
      <ProfileRow
        label="Проходки"
        value={
          profile.freeEntries.regular + profile.freeEntries.vip > 0
            ? `обычных ${profile.freeEntries.regular}, VIP ${profile.freeEntries.vip}`
            : "нет"
        }
      />
      <ProfileRow
        label="Анкета заполнена"
        value={
          profile.submittedAt ? new Date(profile.submittedAt).toLocaleDateString("ru-RU") : "—"
        }
      />
    </div>
  );
}

/**
 * One line of the questionnaire, left out when the player never answered it. A line the
 * desk can act on — a number to call, a chat to open — is drawn as a link.
 */
function ProfileRow({
  href,
  icon,
  label,
  onOpen,
  value,
}: {
  href?: string;
  icon?: ReactNode;
  label: string;
  onOpen?: () => void;
  value: string;
}) {
  if (!value.trim()) return null;

  const linkClassName =
    "inline-flex items-center gap-1.5 text-right font-semibold text-[var(--tg-theme-button-color)]";

  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[var(--tg-theme-hint-color)]">{label}</span>
      {href ? (
        <a className={linkClassName} href={href}>
          {icon}
          {value}
        </a>
      ) : onOpen ? (
        <button className={linkClassName} type="button" onClick={onOpen}>
          {icon}
          {value}
        </button>
      ) : (
        <span className="text-right font-semibold">{value}</span>
      )}
    </div>
  );
}
