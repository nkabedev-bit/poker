"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  Link,
  Loader2,
  Paperclip,
  Send,
  Trash2,
} from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";
import { MoreTabs } from "../more-tabs";
import { ScreenHeader, SectionLabel, ToggleRow } from "../ui";
import { moscowLocalToUtcISO, utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";

type ScheduleVersion = { effectiveFrom: string; text: string };

type ClientBotSettings = {
  ratingUrl: string;
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

const STATUS_TONES: Record<ScheduledBroadcast["status"], string> = {
  canceled: "",
  failed: " tma-badge--red",
  pending: " tma-badge--amber",
  sending: " tma-badge--blue",
  sent: " tma-badge--green",
};

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

  if (loading) return <div className="tma-empty">Загрузка…</div>;

  return (
    <div className="tma-screen">
      <ScreenHeader title="Ещё" />
      <MoreTabs current="bot" />

      <SectionLabel title="Рассылка" />
      <div className="tma-card">
        <textarea
          aria-label="Сообщение"
          className="min-h-28"
          placeholder="Сообщение пользователям клиентского бота"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        {!scheduleEnabled ? (
          <label className="tma-btn tma-btn--inset tma-btn--link">
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

        <ToggleRow
          checked={scheduleEnabled}
          label={
            <span className="flex items-center gap-2">
              <Clock size={16} /> Отправить позже
            </span>
          }
          onChange={(checked) => {
            setScheduleEnabled(checked);
            if (checked) setFiles(null);
          }}
        />

        {scheduleEnabled ? (
          <input
            aria-label="Когда отправить (МСК)"
            type="datetime-local"
            value={scheduleAt}
            onChange={(event) => setScheduleAt(event.target.value)}
          />
        ) : null}

        <button
          className="tma-btn tma-btn--primary"
          disabled={sending}
          type="button"
          onClick={sendBroadcast}
        >
          {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          {scheduleEnabled ? "Запланировать" : "Отправить всем"}
        </button>
      </div>

      {scheduled.length > 0 ? (
        <>
          <SectionLabel meta="запланированные и две последние" title="Отправленные" />
          <div className="tma-card tma-card--flush">
            {scheduled.map((item) => (
              <div key={item.id} className="tma-row !items-start">
                <span className="tma-row__body">
                  <span className="whitespace-pre-wrap break-words text-[15px]">{item.message}</span>
                  <span className="tma-row__sub">{formatMoscow(item.send_at)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className={`tma-badge${STATUS_TONES[item.status]}`}>{STATUS_LABELS[item.status]}</span>
                  {item.status === "pending" ? (
                    <button
                      aria-label="Отменить"
                      className="tma-icon-btn tma-icon-btn--danger"
                      type="button"
                      onClick={() => cancelScheduled(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <SectionLabel title="Настройки бота" />
      <div className="tma-card">
        <label className="tma-field">
          <span className="tma-field__label flex items-center gap-1.5">
            <CalendarDays size={14} /> Расписание следующих турниров
          </span>
          <textarea
            className="min-h-32"
            value={settings.scheduleText}
            onChange={(event) => updateSetting({ scheduleText: event.target.value })}
            placeholder="Текущее расписание (показывается, пока не наступит запланированная версия)"
          />
        </label>

        <p className="tma-hint">
          Запланированные версии: каждая показывается с указанной даты, заменяя предыдущую.
        </p>
        {settings.scheduleVersions.map((version, index) => (
          <div key={index} className="tma-card tma-card--inset !gap-2 !p-3">
            <div className="flex items-center gap-2">
              <input
                aria-label="Показывать с (МСК)"
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
                className="tma-icon-btn tma-icon-btn--danger"
                type="button"
                onClick={() => removeVersion(index)}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <textarea
              aria-label="Текст расписания"
              className="min-h-24"
              value={version.text}
              onChange={(event) => updateVersion(index, { text: event.target.value })}
              placeholder="Текст расписания для этой даты"
            />
          </div>
        ))}
        <button className="tma-btn tma-btn--inset tma-btn--link" type="button" onClick={addVersion}>
          <CalendarPlus size={16} />
          Добавить версию с даты
        </button>

        <label className="tma-field">
          <span className="tma-field__label flex items-center gap-1.5">
            <Link size={14} /> Ссылка на Google-таблицу с рейтингом
          </span>
          <input
            inputMode="url"
            value={settings.ratingUrl}
            onChange={(event) => updateSetting({ ratingUrl: event.target.value })}
            placeholder="https://docs.google.com/spreadsheets/..."
          />
        </label>

        <button
          className="tma-btn tma-btn--primary"
          disabled={saving}
          type="button"
          onClick={saveSettings}
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : null}
          Сохранить настройки
        </button>
      </div>

      {status ? <p className="tma-hint text-center">{status}</p> : null}
    </div>
  );
}
