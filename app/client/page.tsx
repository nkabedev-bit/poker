"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, KeyRound, PartyPopper } from "lucide-react";
import { getClientTelegramWebApp, useClientTMA } from "./layout";
import { GlassCard, LoadingScreen, PrimaryButton, ScreenMessage } from "./_components/ui";

type Registered = {
  registrationNumber: number | null;
  table: number | null;
  name: string;
};

type Me = {
  profileSubmitted: boolean;
  tablesCount: number;
  registered: Registered | null;
};

export default function ClientRegisterPage() {
  const { initData } = useClientTMA();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"code" | "table">("code");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingCode, setCheckingCode] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/client-tma/me", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) setMe(await res.json());
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadMe(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadMe]);

  const checkCode = async () => {
    setCheckingCode(true);
    setError("");
    try {
      const res = await fetch("/api/client-tma/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Не удалось проверить код.");
        return;
      }
      if (!data.valid) {
        setError("Ошибка. Код неверный.");
        getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("error");
        return;
      }
      setStep("table");
    } catch {
      setError("Что-то пошло не так. Попробуйте ещё раз.");
    } finally {
      setCheckingCode(false);
    }
  };

  const register = async (table: number) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/client-tma/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ code, table }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Не удалось зарегистрироваться.");
        if (data.error === "invalid_code") setStep("code");
        getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("error");
        return;
      }
      getClientTelegramWebApp()?.HapticFeedback?.notificationOccurred("success");
      setMe((current) =>
        current ? { ...current, registered: { registrationNumber: data.registrationNumber, table: data.table, name: data.name } } : current,
      );
    } catch {
      setError("Что-то пошло не так. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;

  if (!me?.profileSubmitted) {
    return (
      <ScreenMessage
        icon={<ClipboardList size={34} />}
        title="Сначала заполните анкету"
        subtitle="Вернитесь в бот и заполните анкету — после этого здесь откроется регистрация на игру."
      />
    );
  }

  if (me.registered) {
    return (
      <div className="space-y-5 pt-4">
        <GlassCard className="overflow-hidden text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
            <PartyPopper size={30} />
          </div>
          <h1 className="text-2xl font-bold">Вы в игре!</h1>
          <p className="mt-1 text-sm text-white/55">{me.registered.name}</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Stat label="Номер участника" value={me.registered.registrationNumber ?? "—"} />
            <Stat label="Стол" value={me.registered.table ?? "—"} />
          </div>
        </GlassCard>
        <p className="px-2 text-center text-xs text-white/40">
          Удачи за столом! Достижения обновятся после завершения игры.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-4">
      <div className="px-1">
        <h1 className="text-2xl font-bold">Регистрация на игру</h1>
        <p className="mt-1 text-sm text-white/55">
          {step === "code" ? "Введите кодовое слово от организатора." : "Выберите свой стол."}
        </p>
      </div>

      {step === "code" ? (
        <GlassCard className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-amber-200/80">
            <KeyRound size={16} /> Кодовое слово
          </label>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Введите код"
            autoFocus
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 text-base text-white placeholder:text-white/30 outline-none focus:border-amber-300/50"
          />
          <PrimaryButton
            disabled={!code.trim()}
            loading={checkingCode}
            onClick={() => void checkCode()}
          >
            Продолжить
          </PrimaryButton>
        </GlassCard>
      ) : (
        <GlassCard className="space-y-4">
          <p className="text-sm font-medium text-amber-200/80">Номер стола</p>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: me.tablesCount }, (_, index) => index + 1).map((table) => (
              <button
                key={table}
                disabled={submitting}
                onClick={() => void register(table)}
                className="flex aspect-square items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-2xl font-bold text-white transition active:scale-95 disabled:opacity-50 hover:border-amber-300/50"
              >
                {table}
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {error ? (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {submitting ? (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-amber-200/70">
          <CheckCircle2 size={16} /> Регистрируем…
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-3xl font-bold text-amber-300">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-white/45">{label}</p>
    </div>
  );
}
