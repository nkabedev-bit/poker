"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, KeyRound, Link, Loader2, MessageSquare, Paperclip, Send } from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";

type ClientBotSettings = {
  ratingUrl: string;
  registrationCode: string;
  scheduleText: string;
};

const emptySettings: ClientBotSettings = {
  ratingUrl: "",
  registrationCode: "",
  scheduleText: "",
};

const textFieldClass =
  "w-full rounded-lg border-none bg-white p-3 text-black placeholder:text-neutral-500 outline-none";

export default function TMABotPage() {
  const { initData } = useTMA();
  const [settings, setSettings] = useState<ClientBotSettings>(emptySettings);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/client-bot/settings", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        setSettings(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchSettings(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchSettings]);

  const saveSettings = async () => {
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/tma/client-bot/settings", {
        body: JSON.stringify(settings),
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        method: "POST",
      });

      if (!res.ok) throw new Error("settings_failed");

      setSettings(await res.json());
      setStatus("Настройки сохранены");
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("success");
    } catch {
      setStatus("Не удалось сохранить настройки");
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("error");
    } finally {
      setSaving(false);
    }
  };

  const sendBroadcast = async () => {
    if (!message.trim() && (!files || files.length === 0)) {
      getTelegramWebApp()?.showAlert("Введите сообщение или добавьте вложение");
      return;
    }

    setSending(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.set("message", message);
      Array.from(files ?? []).forEach((file) => formData.append("attachments", file));

      const res = await fetch("/api/tma/client-bot/broadcast", {
        body: formData,
        headers: { "X-Telegram-Init-Data": initData },
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "broadcast_failed");

      setMessage("");
      setFiles(null);
      setStatus(`Отправлено: ${data.sent} из ${data.total}`);
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("success");
    } catch {
      setStatus("Не удалось отправить рассылку");
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("error");
    } finally {
      setSending(false);
    }
  };

  const updateSetting = (patch: Partial<ClientBotSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="space-y-5">
      <section className="bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-black">
          <MessageSquare size={18} />
          <h1 className="text-lg font-bold">Рассылка</h1>
        </div>
        <textarea
          className={`min-h-28 ${textFieldClass}`}
          placeholder="Сообщение пользователям клиентского бота"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--tg-theme-hint-color)] border-opacity-30 p-3 text-sm text-[var(--tg-theme-button-color)]">
          <Paperclip size={16} />
          <span>{files?.length ? `Вложений: ${files.length}` : "Добавить вложения"}</span>
          <input
            className="hidden"
            multiple
            type="file"
            onChange={(event) => setFiles(event.target.files)}
          />
        </label>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] px-4 py-3 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
          disabled={sending}
          onClick={sendBroadcast}
        >
          {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          Отправить
        </button>
      </section>

      <section className="bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-4 space-y-4">
        <SettingLabel icon={<CalendarDays size={18} />} title="Расписание следующих турниров" />
        <textarea
          className={`min-h-32 ${textFieldClass}`}
          value={settings.scheduleText}
          onChange={(event) => updateSetting({ scheduleText: event.target.value })}
          placeholder="Например: Пятница 20:00, воскресенье 18:00"
        />

        <SettingLabel icon={<KeyRound size={18} />} title="Кодовое слово" />
        <input
          className={textFieldClass}
          value={settings.registrationCode}
          onChange={(event) => updateSetting({ registrationCode: event.target.value })}
          placeholder="Код для регистрации"
        />

        <SettingLabel icon={<Link size={18} />} title="Ссылка на Google-таблицу с рейтингом" />
        <input
          className={textFieldClass}
          inputMode="url"
          value={settings.ratingUrl}
          onChange={(event) => updateSetting({ ratingUrl: event.target.value })}
          placeholder="https://docs.google.com/spreadsheets/..."
        />

        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] px-4 py-3 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
          disabled={saving}
          onClick={saveSettings}
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : null}
          Сохранить настройки
        </button>
      </section>

      {status ? <p className="text-center text-sm text-[var(--tg-theme-hint-color)]">{status}</p> : null}
    </div>
  );
}

function SettingLabel({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-black">
      {icon}
      {title}
    </label>
  );
}
