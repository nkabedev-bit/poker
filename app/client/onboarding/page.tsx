"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getClientTelegramWebApp, useClientTMA } from "../layout";
import { PlayerAvatar } from "../_components/player-avatar";
import { Check } from "lucide-react";
import { Eyebrow, PageHeading, PrimaryButton } from "../_components/ui";
import { rememberWelcome } from "../_components/welcome-splash";
import { isValidBirthDate, maskBirthDateInput } from "@/lib/client-bot/registration";

const AGREEMENT_TEXT =
  "Я ознакомлен с положением и принимаю пользовательское соглашение и соблюдаю правила сообщества: фишки НЕ имеют денежного эквивалента, турнир проводится БЕЗ денежных призов, встреча НЕ является игорной деятельностью.";

const SEARCH_DELAY_MS = 350;

/** A club member as the nickname search hands them over. */
type MemberMatch = { avatarUrl: string | null; key: string; name: string };

export default function ClientOnboardingPage() {
  const { initData } = useClientTMA();
  const router = useRouter();

  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [discoverySource, setDiscoverySource] = useState("");
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [invitedBy, setInvitedBy] = useState("");
  const [inviterMatches, setInviterMatches] = useState<MemberMatch[]>([]);
  const [nickname, setNickname] = useState("");
  const [notificationsConsent, setNotificationsConsent] = useState(true);
  const [phone, setPhone] = useState("");
  const [ratingConsent, setRatingConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const searchTimer = useRef<number | null>(null);
  // Only the latest search may fill the list: an answer still on its way when the
  // newcomer picks somebody must not open it again under the name they chose.
  const searchRequest = useRef(0);

  useEffect(
    () => () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    },
    [],
  );

  // A newcomer who came on a friend's "1+1" link was invited by that friend, so the answer
  // is filled in for them. Only a suggestion: they can change it or clear it, and whatever
  // they typed before it arrived stays.
  useEffect(() => {
    let cancelled = false;

    void fetch("/api/client-tma/duo-invite", { headers: { "X-Telegram-Init-Data": initData } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { inviter?: string | null } | null) => {
        const inviter = data?.inviter;
        if (cancelled || !inviter) return;

        setInvitedBy((current) => current || inviter);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [initData]);

  // The server takes only a nickname the club knows, so the members are offered as the
  // newcomer types — a tap puts the exact spelling in the field.
  const searchInviters = async (query: string) => {
    const request = ++searchRequest.current;

    if (query.trim().length < 2) {
      setInviterMatches([]);
      return;
    }

    try {
      const res = await fetch(`/api/client-tma/players?q=${encodeURIComponent(query)}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        if (request === searchRequest.current) {
          setInviterMatches((data.players ?? []) as MemberMatch[]);
        }
      }
    } catch {
      if (request === searchRequest.current) setInviterMatches([]);
    }
  };

  const typeInviter = (value: string) => {
    setInvitedBy(value);

    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => void searchInviters(value), SEARCH_DELAY_MS);
  };

  const pickInviter = (match: MemberMatch) => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchRequest.current += 1;
    setInvitedBy(match.name);
    setInviterMatches([]);
  };

  const submit = async () => {
    setError("");

    if (!isValidBirthDate(birthDate)) {
      setError("Дата рождения — цифрами в формате ДД.ММ.ГГГГ.");
      return;
    }

    setSubmitting(true);
    const tg = getClientTelegramWebApp();

    try {
      const res = await fetch("/api/client-tma/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          agreementAccepted,
          birthDate,
          discoverySource,
          fullName,
          invitedBy,
          nickname,
          notificationsConsent,
          phone,
          ratingConsent,
        }),
      });

      if (res.ok) {
        tg?.HapticFeedback?.notificationOccurred("success");
        rememberWelcome();
        router.replace("/client");
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback?.notificationOccurred("error");
      setError(data?.message ?? "Не удалось сохранить анкету.");
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  // What the questionnaire asks for, counted as it fills in: the inviter is optional
  // and the agreement is a tick, not a field.
  const filled = [fullName, nickname, phone, birthDate, discoverySource].filter((value) => value.trim()).length;

  return (
    // On a computer the form keeps the left column and the progress stands beside it.
    <div className="client-stagger flex flex-col gap-6 pt-1 md:pt-0 desk:grid desk:grid-cols-[minmax(0,1fr)_320px] desk:items-start desk:gap-x-8 desk:gap-y-7">
      <div className="flex flex-col gap-2.5 desk:contents">
        <div className="desk:col-span-2">
          <PageHeading subtitle="Заполните один раз — после этого откроется запись на турниры" title="Анкета игрока" />
        </div>
        <div className="flex flex-col gap-2.5 desk:col-start-2 desk:row-start-2 desk:gap-3.5 desk:rounded-[22px] desk:border desk:border-club-line desk:bg-club-surface desk:p-[22px]">
          <div className="mt-1.5 flex gap-1.5 desk:mt-0">
            {Array.from({ length: FIELDS_TOTAL }, (_, index) => (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  index < filled ? "bg-club-crimson" : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <p className="text-[12px] text-club-faint">
            Заполнено {filled} из {FIELDS_TOTAL} полей
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-4 desk:col-start-1">
        <Eyebrow>О вас</Eyebrow>
        <Field label="Имя и фамилия">
          <input
            className={inputClass}
            placeholder="Иван Иванов"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </Field>

        <Field
          label="Игровой никнейм"
          hint="Если вы уже играли у нас — введите тот же никнейм, что и раньше. Изменить его потом нельзя."
        >
          <input
            className={inputClass}
            placeholder="Ваш игровой ник"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Телефон">
            <input
              className={inputClass}
              inputMode="tel"
              placeholder="+7 900 000-00-00"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>

          <Field label="Дата рождения">
            <input
              className={inputClass}
              inputMode="numeric"
              maxLength={10}
              placeholder="ДД.ММ.ГГГГ"
              value={birthDate}
              onChange={(event) => setBirthDate(maskBirthDateInput(event.target.value))}
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3 desk:col-start-1">
        <Eyebrow>Как вы о нас узнали?</Eyebrow>
        {/* The common answers are a tap away; anything else is typed in below them. */}
        <div className="flex flex-wrap gap-2">
          {DISCOVERY_SOURCES.map((source) => {
            const chosen = discoverySource.trim() === source;

            return (
              <button
                key={source}
                aria-pressed={chosen}
                className={`h-10 rounded-xl border px-3.5 text-[13px] font-bold transition-colors ${
                  chosen ? "border-club-text bg-club-text text-[#15100f]" : "border-club-line bg-club-surface text-club-text"
                }`}
                type="button"
                onClick={() => setDiscoverySource(chosen ? "" : source)}
              >
                {source}
              </button>
            );
          })}
        </div>
        <input
          aria-label="Как вы о нас узнали"
          className={inputClass}
          placeholder="Друзья, соцсети, реклама…"
          value={discoverySource}
          onChange={(event) => setDiscoverySource(event.target.value)}
        />

        <Field hint="Если вас пригласил игрок, что состоит в клубе — укажите его ник" label="Кто вас пригласил?">
          <input
            autoComplete="off"
            className={inputClass}
            maxLength={40}
            placeholder="Ник игрока клуба — необязательно"
            value={invitedBy}
            onChange={(event) => typeInviter(event.target.value)}
          />
        </Field>

        {inviterMatches.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {inviterMatches.map((match) => (
              <button
                key={match.key}
                className="flex h-14 w-full items-center gap-3 rounded-[14px] border border-club-line bg-club-surface px-3 text-left"
                type="button"
                onClick={() => pickInviter(match)}
              >
                <PlayerAvatar name={match.name} photoUrl={match.avatarUrl ?? undefined} size={34} />
                <span className="truncate text-[15px] font-bold">{match.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 desk:col-start-1">
        <Eyebrow>Согласия</Eyebrow>
        <Toggle checked={agreementAccepted} onChange={setAgreementAccepted}>
          {AGREEMENT_TEXT}
        </Toggle>
        <Toggle checked={ratingConsent} onChange={setRatingConsent}>
          Согласие на участие в рейтинге Majestic
        </Toggle>
        <Toggle checked={notificationsConsent} onChange={setNotificationsConsent}>
          Согласие на уведомления о будущих играх
        </Toggle>
      </section>

      {error ? <p className="text-center text-sm text-club-rose desk:col-start-1">{error}</p> : null}

      <div className="desk:col-start-1">
        <PrimaryButton disabled={!agreementAccepted} loading={submitting} onClick={() => void submit()}>
          Сохранить анкету
        </PrimaryButton>
      </div>
    </div>
  );
}

/** The fields the progress bar counts: name, nickname, phone, birthday, how they found us. */
const FIELDS_TOTAL = 5;

const DISCOVERY_SOURCES = ["Друзья", "Соцсети", "Реклама", "Другое"] as const;

const inputClass =
  "h-[52px] w-full rounded-[14px] border border-club-line bg-club-surface px-4 text-[15px] font-semibold text-club-text outline-none placeholder:font-medium placeholder:text-club-faint focus:border-club-rose";

function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  // A label is a grid with an 8px gap by the global style, which is the spacing wanted.
  return (
    <label className="min-w-0">
      <span className="text-[13px] font-bold text-club-text">{label}</span>
      {children}
      {hint ? <span className="text-[12px] leading-relaxed text-club-muted">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  checked,
  children,
  onChange,
}: {
  checked: boolean;
  children: React.ReactNode;
  onChange: (value: boolean) => void;
}) {
  // The global style makes a label a grid, so the box and the words sit in a flex row
  // of their own inside it.
  return (
    <label className="cursor-pointer rounded-2xl border border-club-line bg-club-surface p-3.5">
      <div className="flex items-start gap-3">
        <input
          checked={checked}
          className="peer sr-only"
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span
          aria-hidden
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-club-rose ${
            checked ? "bg-club-crimson text-white" : "border-2 border-club-faint"
          }`}
        >
          {checked ? <Check size={15} strokeWidth={3} /> : null}
        </span>
        <span className="text-[13px] leading-relaxed text-club-text">{children}</span>
      </div>
    </label>
  );
}
