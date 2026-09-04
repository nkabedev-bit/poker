"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getClientTelegramWebApp, useClientTMA } from "../layout";
import { GlassCard, PageTitle, PrimaryButton } from "../_components/ui";
import { isValidBirthDate, maskBirthDateInput } from "@/lib/client-bot/registration";

const AGREEMENT_TEXT =
  "Я ознакомлен с положением и принимаю пользовательское соглашение и соблюдаю правила сообщества: фишки НЕ имеют денежного эквивалента, турнир проводится БЕЗ денежных призов, встреча НЕ является игорной деятельностью.";

export default function ClientOnboardingPage() {
  const { initData } = useClientTMA();
  const router = useRouter();

  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const [discoverySource, setDiscoverySource] = useState("");
  const [error, setError] = useState("");
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [notificationsConsent, setNotificationsConsent] = useState(true);
  const [phone, setPhone] = useState("");
  const [ratingConsent, setRatingConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
          nickname,
          notificationsConsent,
          phone,
          ratingConsent,
        }),
      });

      if (res.ok) {
        tg?.HapticFeedback?.notificationOccurred("success");
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

  return (
    <div className="space-y-5 pt-1">
      <div className="space-y-1.5">
        <PageTitle>Анкета игрока</PageTitle>
        <p className="text-sm text-white/45">
          Заполните один раз — после этого откроется запись на турниры.
        </p>
      </div>

      <GlassCard className="space-y-4">
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
            placeholder="Киберпсих"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </Field>

        <Field label="Номер телефона">
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

        <Field label="Как вы о нас узнали?">
          <input
            className={inputClass}
            placeholder="Друзья, соцсети, реклама…"
            value={discoverySource}
            onChange={(event) => setDiscoverySource(event.target.value)}
          />
        </Field>
      </GlassCard>

      <GlassCard className="space-y-3">
        <Toggle checked={ratingConsent} onChange={setRatingConsent}>
          Согласие на участие в рейтинге Majestic
        </Toggle>
        <Toggle checked={notificationsConsent} onChange={setNotificationsConsent}>
          Согласие на уведомления о будущих играх
        </Toggle>
        <Toggle checked={agreementAccepted} onChange={setAgreementAccepted}>
          {AGREEMENT_TEXT}
        </Toggle>
      </GlassCard>

      {error ? <p className="text-center text-sm text-rose-300">{error}</p> : null}

      <PrimaryButton disabled={!agreementAccepted} loading={submitting} onClick={() => void submit()}>
        Сохранить анкету
      </PrimaryButton>
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-white/[0.07] bg-black/30 px-4 py-3.5 text-[15px] text-white placeholder:text-white/25 outline-none focus:border-[#c8163f]";

function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-white/75">{label}</span>
      {children}
      {hint ? <span className="block text-[12px] leading-relaxed text-white/35">{hint}</span> : null}
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
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        checked={checked}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[#c8163f]"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-sm leading-relaxed text-white/70">{children}</span>
    </label>
  );
}
