"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  KeyRound,
  Link,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
} from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";
import { moscowLocalToUtcISO, utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";

type ScheduleVersion = { effectiveFrom: string; text: string };

type ClientBotSettings = {
  ratingUrl: string;
  registrationCode: string;
  scheduleText: string;
  scheduleVersions: ScheduleVersion[];
};

type ScheduledBroadcast = {
  id: string;
  message: string;
  send_at: string;
  status: "pending" | "sending" | "sent" | "failed" | "canceled";
  sent_at: string | null;
  result: { sent?: number; failed?: number; total?: number; error?: string } | null;
};

const emptySettings: ClientBotSettings = {
  ratingUrl: "",
  registrationCode: "",
  scheduleText: "",
  scheduleVersions: [],
};

const STATUS_LABELS: Record<ScheduledBroadcast["status"], string> = {
  pending: "ожидает",
  sending: "отправляется",
  sent: "отправлено",
  failed: "ошибка",
  canceled: "отменено",
};

const textFieldClass =
  "w-full rounded-lg border-none bg-white p-3 text-black placeholder:text-neutral-500 outline-none";

function formatMoscow(iso: string): string {
  // utcISOToMoscowLocal -> "2026-06-19T14:00" -> "19.06.2026 14:00"
  const [date, time] = utcISOToMoscowLocal(iso).split("T");
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y} ${time}`;
}

export default function TMABotPage() {
  const { initData } = useTMA();
  const [settings, setSettings] = useState<ClientBotSettings>(emptySettings);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduled, setScheduled] = useState<ScheduledBroadcast[]>([]);
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
        const data = (await res.json()) as Partial<ClientBotSettings>;
        setSettings({ ...emptySettings, ...data, scheduleVersions: data.scheduleVersions ?? [] });
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  const fetchScheduled = useCallback(async () => {
    const res = await fetch("/api/tma/client-bot/scheduled", {
      headers: { "X-Telegram-Init-Data": initData },
    });
    if (res.ok) {
      const data = await res.json();
      setScheduled(data.items ?? []);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchSettings();
      void fetchScheduled();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchSettings, fetchScheduled]);

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

      const data = (await res.json()) as Partial<ClientBotSettings>;
      setSettings({ ...emptySettings, ...data, scheduleVersions: data.scheduleVersions ?? [] });
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
    if (scheduleEnabled && !scheduleAt) {
      getTelegramWebApp()?.showAlert("Укажите дату и время отправки");
      return;
    }
    if (scheduleEnabled && !message.trim()) {
      getTelegramWebApp()?.showAlert("Отложенная рассылка — только текст, введите сообщение");
      return;
    }

    setSending(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.set("message", message);
      if (scheduleEnabled) {
        formData.set("sendAt", moscowLocalToUtcISO(scheduleAt));
      } else {
        Array.from(files ?? []).forEach((file) => formData.append("attachments", file));
      }

      const res = await fetch("/api/tma/client-bot/broadcast", {
        body: formData,
        headers: { "X-Telegram-Init-Data": initData },
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "broadcast_failed");

      setMessage("");
      setFiles(null);
      if (data.scheduled) {
        setScheduleEnabled(false);
        setScheduleAt("");
        setStatus(`Запланировано на ${formatMoscow(data.sendAt)}`);
        void fetchScheduled();
      } else {
        setStatus(`Отправлено: ${data.sent} из ${data.total}`);
      }
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("success");
    } catch {
      setStatus("Не удалось отправить рассылку");
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("error");
    } finally {
      setSending(false);
    }
  };

  const cancelScheduled = async (id: string) => {
    const res = await fetch(`/api/tma/client-bot/scheduled/${id}`, {
      headers: { "X-Telegram-Init-Data": initData },
      method: "DELETE",
    });
    if (res.ok) {
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("success");
      void fetchScheduled();
    } else {
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("error");
    }
  };

  const updateSetting = (patch: Partial<ClientBotSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const updateVersion = (index: number, patch: Partial<ScheduleVersion>) => {
    setSettings((current) => ({
      ...current,
      scheduleVersions: current.scheduleVersions.map((v, i) =>
        i === index ? { ...v, ...patch } : v,
      ),
    }));
  };

  const addVersion = () => {
    setSettings((current) => ({
      ...current,
      scheduleVersions: [...current.scheduleVersions, { effectiveFrom: "", text: "" }],
    }));
  };

  const removeVersion = (index: number) => {
    setSettings((current) => ({
      ...current,
      scheduleVersions: current.scheduleVersions.filter((_, i) => i !== index),
    }));
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

        {!scheduleEnabled ? (
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
        ) : null}

        <label className="flex items-center gap-2 text-sm font-semibold text-black">
          <input
            checked={scheduleEnabled}
            onChange={(event) => {
              setScheduleEnabled(event.target.checked);
              if (event.target.checked) setFiles(null);
            }}
            type="checkbox"
          />
          <Clock size={16} />
          Отправить позже
        </label>

        {scheduleEnabled ? (
          <input
            className={textFieldClass}
            type="datetime-local"
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
          />
        ) : null}

        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] px-4 py-3 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
          disabled={sending}
          onClick={sendBroadcast}
        >
          {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          {scheduleEnabled ? "Запланировать" : "Отправить"}
        </button>
      </section>

      {scheduled.length > 0 ? (
        <section className="bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-black">
            <Clock size={18} />
            <h2 className="text-base font-bold">Запланированные рассылки</h2>
          </div>
          {scheduled.map((item) => (
            <div key={item.id} className="rounded-lg bg-white p-3 text-sm text-black">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{formatMoscow(item.send_at)}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[var(--tg-theme-hint-color)]">
                    {STATUS_LABELS[item.status]}
                  </span>
                  {item.status === "pending" ? (
                    <button
                      aria-label="Отменить"
                      className="text-red-500"
                      onClick={() => cancelScheduled(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-neutral-700">{item.message}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-4 space-y-4">
        <SettingLabel icon={<CalendarDays size={18} />} title="Расписание следующих турниров" />
        <textarea
          className={`min-h-32 ${textFieldClass}`}
          value={settings.scheduleText}
          onChange={(event) => updateSetting({ scheduleText: event.target.value })}
          placeholder="Текущее расписание (показывается, пока не наступит запланированная версия)"
        />

        <div className="space-y-3">
          <p className="text-xs text-[var(--tg-theme-hint-color)]">
            Запланированные версии: каждая показывается с указанной даты, заменяя предыдущую.
          </p>
          {settings.scheduleVersions.map((version, index) => (
            <div key={index} className="rounded-lg bg-white/60 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  className={textFieldClass}
                  type="datetime-local"
                  value={version.effectiveFrom ? utcISOToMoscowLocal(version.effectiveFrom) : ""}
                  onChange={(event) =>
                    updateVersion(index, {
                      effectiveFrom: event.target.value
                        ? moscowLocalToUtcISO(event.target.value)
                        : "",
                    })
                  }
                />
                <button
                  aria-label="Удалить версию"
                  className="shrink-0 text-red-500"
                  onClick={() => removeVersion(index)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <textarea
                className={`min-h-24 ${textFieldClass}`}
                value={version.text}
                onChange={(event) => updateVersion(index, { text: event.target.value })}
                placeholder="Текст расписания для этой даты"
              />
            </div>
          ))}
          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--tg-theme-hint-color)] border-opacity-30 p-3 text-sm text-[var(--tg-theme-button-color)]"
            onClick={addVersion}
          >
            <CalendarPlus size={16} />
            Добавить версию
          </button>
        </div>

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
