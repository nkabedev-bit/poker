"use client";

import { useEffect, useState } from "react";
import { Send, TriangleAlert } from "lucide-react";
import { PrimaryButton } from "../_components/ui";

/** What went wrong when a pass from the mini-app met the Yandex sign-in. */
const LINK_ERRORS: Record<string, string> = {
  account_gone: "Профиль не найден. Откройте клуб в Telegram и нажмите на объявление ещё раз.",
  other_yandex: "К вашему профилю уже привязан другой Яндекс ID. Войдите через него — или напишите администратору клуба.",
  yandex_taken: "Этот Яндекс ID уже привязан к другому профилю клуба. Напишите администратору — поможем разобраться.",
};

/**
 * The pass a player brings from the mini-app, and what became of an earlier try. Read
 * off the address after the first paint: useSearchParams would make the page wait on a
 * Suspense boundary for no gain.
 */
function useLinkParams() {
  const [params, setParams] = useState<{ error: string | null; link: string | null }>({ error: null, link: null });
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setParams({ error: query.get("link_error"), link: query.get("link") });
  }, []);
  return params;
}

/**
 * The way in for a player who does not use Telegram.
 *
 * Yandex was chosen because it asks nothing of the club — no domain of its own, no VPN —
 * and nearly everyone here already has an account.
 */
export default function ClientLoginPage() {
  const { error, link } = useLinkParams();
  const linkError = error ? LINK_ERRORS[error] ?? LINK_ERRORS.account_gone : null;
  // Sent over from the mini-app: the sign-in will land in the player's own profile.
  const fromTelegram = Boolean(link) && !linkError;
  const startUrl = fromTelegram ? `/api/auth/yandex/start?link=${encodeURIComponent(link ?? "")}` : "/api/auth/yandex/start";

  return (
    <div className="flex min-h-full flex-col gap-6 pb-8">
      <div className="flex flex-col items-center gap-[22px] pt-[60px] text-center">
        <div aria-hidden className="relative h-[120px] w-[150px]">
          <LoginCard className="left-[22px] top-2 -rotate-12 text-[#15100f]" rank="A" suit="♠" />
          <LoginCard className="left-[62px] top-1 rotate-[10deg] text-club-crimson" rank="A" suit="♥" />
        </div>
        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">
            {fromTelegram ? "Majestic на экране телефона" : "Вход в клуб"}
          </h1>
          <p className="text-[15px] leading-relaxed text-club-muted">
            {fromTelegram
              ? "Войдите через свой Яндекс — мы привяжем к нему ваш ник и профиль клуба. После этого добавьте иконку на главный экран: так приложение будет открываться даже без обходов связи."
              : "Афиши, запись на турниры, рейтинг и ваш профиль — после входа"}
          </p>
        </div>
      </div>

      {linkError ? (
        <div className="flex items-start gap-3 rounded-[18px] border border-club-rose/45 bg-club-crimson/12 px-4 py-3.5">
          <TriangleAlert className="mt-0.5 shrink-0 text-club-rose" size={20} />
          <p className="text-[13px] leading-relaxed">{linkError}</p>
        </div>
      ) : null}

      <div className="mt-10 flex flex-col gap-3">
        <PrimaryButton
          className="!bg-club-text !text-[#15100f] !shadow-none"
          onClick={() => window.location.assign(startUrl)}
        >
          {fromTelegram ? "Продолжить" : "Войти с Яндекс ID"}
        </PrimaryButton>
        <p className="text-center text-[12px] leading-relaxed text-club-faint">
          Мы получим только имя, почту и фото профиля — чтобы узнавать вас в следующий
          раз и показывать в рейтинге клуба.
        </p>
      </div>

      {fromTelegram ? null : (
        <div className="flex items-center gap-3 rounded-[18px] border border-club-line bg-club-surface px-4 py-3.5">
          <Send className="shrink-0 text-club-rose" size={20} />
          <p className="text-[13px] leading-relaxed text-club-muted">
            Играете через Telegram? Откройте клуб в боте — там вход не нужен.
          </p>
        </div>
      )}
    </div>
  );
}

/** One of the two aces over the sign-in: cream, rank over suit, the way the club deck prints them. */
function LoginCard({ className, rank, suit }: { className: string; rank: string; suit: string }) {
  return (
    <span
      className={`absolute flex h-[95px] w-[70px] flex-col items-center justify-center rounded-xl bg-club-card font-display leading-none shadow-[0_2px_6px_rgba(0,0,0,0.5)] ${className}`}
    >
      <span className="text-[35px] font-bold">{rank}</span>
      <span className="text-[32px]">{suit}</span>
    </span>
  );
}
