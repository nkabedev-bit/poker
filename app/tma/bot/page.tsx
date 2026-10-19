"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  Clock,
  Link,
  Loader2,
  Megaphone,
  Paperclip,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";
import { MoreTabs } from "../more-tabs";
import { ScreenHeader, SectionLabel, ToggleRow } from "../ui";
import { moscowLocalToUtcISO, utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";
import {
  HOME_ANNOUNCEMENT_MAX_LENGTH,
  HOME_ANNOUNCEMENTS_LIMIT,
  isHomeAnnouncementShown,
  type HomeAnnouncementDraft,
} from "@/lib/client/home-announcements";

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

/** A card of the players' home carousel while the desk edits it; new ones have no id yet. */
type AnnouncementEdit = {
  id: string | null;
  /** React's key: the id once saved, a made-up one before that. */
  key: string;
  linkUrl: string;
  message: string;
  /** ISO timestamp, or "" for no end of showing. */
  showUntil: string;
};

let newAnnouncementCount = 0;

function toAnnouncementEdits(items: HomeAnnouncementDraft[]): AnnouncementEdit[] {
  return items.map((item) => ({
    id: item.id,
    key: item.id,
    linkUrl: item.linkUrl ?? "",
    message: item.message,
    showUntil: item.showUntil ?? "",
  }));
}

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
  const [announcements, setAnnouncements] = useState<AnnouncementEdit[]>([]);
  // Why the carousel cannot be edited (no migration yet, no answer); "" when it can.
  const [announcementsUnavailable, setAnnouncementsUnavailable] = useState("");
  // The clock as the list arrived, for telling which cards have run out.
  const [announcementsLoadedAt, setAnnouncementsLoadedAt] = useState<Date | null>(null);
  const [savingAnnouncements, setSavingAnnouncements] = useState(false);
  const [announcementsStatus, setAnnouncementsStatus] = useState("");

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

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/client-bot/home-announcements", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: HomeAnnouncementDraft[];
      };
      if (!res.ok) {
        setAnnouncementsUnavailable(data.error ?? "Не удалось загрузить объявления");
        return;
      }
      setAnnouncements(toAnnouncementEdits(data.items ?? []));
      setAnnouncementsUnavailable("");
      setAnnouncementsLoadedAt(new Date());
    } catch {
      setAnnouncementsUnavailable("Не удалось загрузить объявления");
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchSettings();
      void fetchScheduled();
      void fetchAnnouncements();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchSettings, fetchScheduled, fetchAnnouncements]);

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

  const updateAnnouncement = (index: number, patch: Partial<AnnouncementEdit>) => {
    setAnnouncements((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  // A new card goes first: that is the slide players see without swiping.
  const addAnnouncement = () => {
    newAnnouncementCount += 1;
    setAnnouncements((current) => [
      { id: null, key: `new-${newAnnouncementCount}`, linkUrl: "", message: "", showUntil: "" },
      ...current,
    ]);
  };

  const moveAnnouncement = (index: number, step: -1 | 1) => {
    setAnnouncements((current) => {
      const target = index + step;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeAnnouncement = (index: number) => {
    setAnnouncements((current) => current.filter((_, i) => i !== index));
  };

  const saveAnnouncements = async () => {
    setSavingAnnouncements(true);
    setAnnouncementsStatus("");
    try {
      const res = await fetch("/api/tma/client-bot/home-announcements", {
        body: JSON.stringify({
          items: announcements.map((item) => ({
            id: item.id,
            linkUrl: item.linkUrl,
            message: item.message,
            showUntil: item.showUntil || null,
          })),
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        method: "PUT",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        items?: HomeAnnouncementDraft[];
      };
      if (!res.ok) {
        // The server names what is wrong ("Объявление 2: пустой текст"), so the desk sees it.
        setAnnouncementsStatus(data.error ?? "Не удалось сохранить объявления");
        getTelegramWebApp()?.HapticFeedback.notificationOccurred("error");
        return;
      }

      setAnnouncements(toAnnouncementEdits(data.items ?? []));
      setAnnouncementsLoadedAt(new Date());
      setAnnouncementsStatus("Объявления сохранены");
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("success");
    } catch {
      setAnnouncementsStatus("Не удалось сохранить объявления");
      getTelegramWebApp()?.HapticFeedback.notificationOccurred("error");
    } finally {
      setSavingAnnouncements(false);
    }
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

      <SectionLabel meta="карусель на главной у игроков" title="Объявления клуба" />
      <div className="tma-card">
        {announcementsUnavailable ? (
          <p className="tma-hint">{announcementsUnavailable}</p>
        ) : (
          <>
            <p className="tma-hint">
              Первая карточка видна сразу, остальные игрок листает свайпом. Без ссылки карточка
              просто текст. Срок пустой — висит, пока не удалите.
            </p>

            {announcements.length < HOME_ANNOUNCEMENTS_LIMIT ? (
              <button className="tma-btn tma-btn--inset tma-btn--link" type="button" onClick={addAnnouncement}>
                <Plus size={16} />
                Добавить объявление
              </button>
            ) : null}

            {announcements.map((item, index) => {
              const expired = announcementsLoadedAt !== null
                && Boolean(item.showUntil)
                && !isHomeAnnouncementShown(item, announcementsLoadedAt);

              return (
                <div key={item.key} className="tma-card tma-card--inset !gap-2 !p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[13px] text-[color:var(--tma-hint)]">
                      <Megaphone size={14} /> Карточка {index + 1}
                      {expired ? <span className="tma-badge">срок вышел</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        aria-label="Выше"
                        className="tma-icon-btn"
                        disabled={index === 0}
                        type="button"
                        onClick={() => moveAnnouncement(index, -1)}
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        aria-label="Ниже"
                        className="tma-icon-btn"
                        disabled={index === announcements.length - 1}
                        type="button"
                        onClick={() => moveAnnouncement(index, 1)}
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        aria-label="Удалить объявление"
                        className="tma-icon-btn tma-icon-btn--danger"
                        type="button"
                        onClick={() => removeAnnouncement(index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </span>
                  </div>

                  <textarea
                    aria-label="Текст объявления"
                    className="min-h-20"
                    maxLength={HOME_ANNOUNCEMENT_MAX_LENGTH}
                    placeholder="Majestic едет в Сочи, нажмите для подробностей!"
                    value={item.message}
                    onChange={(event) => updateAnnouncement(index, { message: event.target.value })}
                  />

                  <label className="tma-field">
                    <span className="tma-field__label flex items-center gap-1.5">
                      <Link size={14} /> Куда ведёт (необязательно)
                    </span>
                    <input
                      inputMode="url"
                      placeholder="https://t.me/majesticpokerptz/..."
                      value={item.linkUrl}
                      onChange={(event) => updateAnnouncement(index, { linkUrl: event.target.value })}
                    />
                  </label>

                  <div className="flex items-end gap-2">
                    <label className="tma-field flex-1">
                      <span className="tma-field__label flex items-center gap-1.5">
                        <Clock size={14} /> Показывать до (МСК, необязательно)
                      </span>
                      <input
                        type="datetime-local"
                        value={item.showUntil ? utcISOToMoscowLocal(item.showUntil) : ""}
                        onChange={(event) =>
                          updateAnnouncement(index, {
                            showUntil: event.target.value ? moscowLocalToUtcISO(event.target.value) : "",
                          })
                        }
                      />
                    </label>
                    {item.showUntil ? (
                      <button
                        aria-label="Без срока"
                        className="tma-icon-btn"
                        type="button"
                        onClick={() => updateAnnouncement(index, { showUntil: "" })}
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}

            <button
              className="tma-btn tma-btn--primary"
              disabled={savingAnnouncements}
              type="button"
              onClick={saveAnnouncements}
            >
              {savingAnnouncements ? <Loader2 className="animate-spin" size={18} /> : null}
              Сохранить объявления
            </button>
            {announcementsStatus ? <p className="tma-hint text-center">{announcementsStatus}</p> : null}
          </>
        )}
      </div>

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
