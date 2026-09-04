"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";
import { utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";
import { addMinutesToMoscowLocal, type EventTemplate } from "@/lib/events/templates";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

type EventRow = TournamentEvent & { signupsCount: number };

const textFieldClass =
  "w-full rounded-lg border border-[var(--tg-theme-hint-color)]/30 bg-[var(--tg-theme-secondary-bg-color)] p-3 text-[var(--tg-theme-text-color)] placeholder:text-[var(--tg-theme-hint-color)] outline-none";

// The club's standing prices; an admin can still change them per tournament.
const DEFAULT_BUY_IN = "1250";
const DEFAULT_VIP_BUY_IN = "2000";

const EMPTY_DRAFT = {
  badge: "",
  buyIn: DEFAULT_BUY_IN,
  featuresText: "",
  id: "",
  isPublished: false,
  lateEntryUntil: "",
  maxPlayers: "",
  maxVipPlayers: "",
  posterDataUrl: "",
  posterUrl: "",
  rulesText: "",
  startingStack: "",
  startsAt: "",
  title: "",
  venueAddress: "",
  vipBuyIn: DEFAULT_VIP_BUY_IN,
};

type Draft = typeof EMPTY_DRAFT;

function toDraft(event: EventRow): Draft {
  return {
    badge: event.badge ?? "",
    buyIn: event.buyIn ? String(event.buyIn) : "",
    featuresText: event.featuresText,
    id: event.id,
    isPublished: event.isPublished,
    lateEntryUntil: event.lateEntryUntil ? utcISOToMoscowLocal(event.lateEntryUntil) : "",
    maxPlayers: event.maxPlayers ? String(event.maxPlayers) : "",
    maxVipPlayers: event.maxVipPlayers ? String(event.maxVipPlayers) : "",
    posterDataUrl: "",
    posterUrl: event.posterUrl ?? "",
    rulesText: event.rulesText,
    startingStack: event.startingStack ? String(event.startingStack) : "",
    startsAt: utcISOToMoscowLocal(event.startsAt),
    title: event.title,
    venueAddress: event.venueAddress,
    vipBuyIn: event.vipBuyIn ? String(event.vipBuyIn) : "",
  };
}

export default function TMAEventsPage() {
  const { initData } = useTMA();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const posterInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [eventsRes, templatesRes] = await Promise.all([
        fetch("/api/tma/events", { headers: { "X-Telegram-Init-Data": initData } }),
        fetch("/api/tma/event-templates", { headers: { "X-Telegram-Init-Data": initData } }),
      ]);

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events ?? []);
      }

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  /**
   * Fills the form from a saved poster, leaving the date alone: it is the one thing
   * that changes from week to week.
   */
  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setDraft((current) =>
      current
        ? {
            ...current,
            badge: template.badge ?? "",
            buyIn: template.buyIn ? String(template.buyIn) : "",
            featuresText: template.featuresText,
            lateEntryUntil:
              template.lateEntryMinutes && current.startsAt
                ? addMinutesToMoscowLocal(current.startsAt, template.lateEntryMinutes)
                : current.lateEntryUntil,
            maxPlayers: template.maxPlayers ? String(template.maxPlayers) : "",
            maxVipPlayers: template.maxVipPlayers ? String(template.maxVipPlayers) : "",
            posterDataUrl: "",
            posterUrl: template.posterUrl ?? "",
            rulesText: template.rulesText,
            startingStack: template.startingStack ? String(template.startingStack) : "",
            title: template.title,
            venueAddress: template.venueAddress,
            vipBuyIn: template.vipBuyIn ? String(template.vipBuyIn) : "",
          }
        : current,
    );
  };

  const saveTemplate = () => {
    const tg = getTelegramWebApp();
    if (!draft || saving) return;

    const question = `Сохранить «${draft.title || "афишу"}» как шаблон? Дата и время в шаблон не попадут.`;

    if (!tg?.showConfirm) {
      void sendTemplate();
      return;
    }

    tg.showConfirm(question, (confirmed: boolean) => {
      if (confirmed) void sendTemplate();
    });
  };

  const sendTemplate = async () => {
    const tg = getTelegramWebApp();
    if (!draft) return;

    setSaving(true);
    try {
      const res = await fetch("/api/tma/event-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({
          badge: draft.badge,
          buyIn: draft.buyIn || 0,
          featuresText: draft.featuresText,
          lateEntryUntil: draft.lateEntryUntil,
          maxPlayers: draft.maxPlayers ? Number(draft.maxPlayers) : null,
          maxVipPlayers: draft.maxVipPlayers ? Number(draft.maxVipPlayers) : null,
          name: draft.title,
          posterUrl: draft.posterUrl,
          rulesText: draft.rulesText,
          startingStack: draft.startingStack ? Number(draft.startingStack) : null,
          startsAt: draft.startsAt,
          title: draft.title,
          venueAddress: draft.venueAddress,
          vipBuyIn: draft.vipBuyIn ? Number(draft.vipBuyIn) : null,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.showAlert(data?.error ?? "Не удалось сохранить шаблон");
        return;
      }

      setTemplates(data.templates ?? []);
      tg?.HapticFeedback.notificationOccurred("success");
    } finally {
      setSaving(false);
    }
  };

  const pickPoster = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => update({ posterDataUrl: String(reader.result ?? "") });
    reader.readAsDataURL(file);
  };

  const save = async () => {
    const tg = getTelegramWebApp();
    if (!draft || saving) return;

    if (!draft.title.trim() || !draft.startsAt) {
      tg?.showAlert("Заполните название и время начала");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        badge: draft.badge,
        buyIn: draft.buyIn || 0,
        featuresText: draft.featuresText,
        isPublished: draft.isPublished,
        lateEntryUntil: draft.lateEntryUntil,
        maxPlayers: draft.maxPlayers ? Number(draft.maxPlayers) : null,
        maxVipPlayers: draft.maxVipPlayers ? Number(draft.maxVipPlayers) : null,
        posterDataUrl: draft.posterDataUrl || undefined,
        posterUrl: draft.posterUrl,
        rulesText: draft.rulesText,
        startingStack: draft.startingStack ? Number(draft.startingStack) : null,
        startsAt: draft.startsAt,
        title: draft.title,
        venueAddress: draft.venueAddress,
        vipBuyIn: draft.vipBuyIn ? Number(draft.vipBuyIn) : null,
      };

      const res = await fetch(draft.id ? `/api/tma/events/${draft.id}` : "/api/tma/events", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        setDraft(null);
        await load();
        return;
      }

      const data = await res.json().catch(() => null);
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(data?.error ?? "Не удалось сохранить афишу");
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (event: EventRow) => {
    const tg = getTelegramWebApp();
    const res = await fetch(`/api/tma/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
      body: JSON.stringify({ isPublished: !event.isPublished }),
    });

    if (res.ok) {
      tg?.HapticFeedback.impactOccurred("light");
      await load();
      return;
    }

    tg?.showAlert("Не удалось изменить статус афиши");
  };

  const remove = (event: EventRow) => {
    const tg = getTelegramWebApp();
    tg?.showConfirm(`Удалить афишу «${event.title}»?`, async (confirmed: boolean) => {
      if (!confirmed) return;

      const res = await fetch(`/api/tma/events/${event.id}`, {
        method: "DELETE",
        headers: { "X-Telegram-Init-Data": initData },
      });

      if (res.ok) {
        tg?.HapticFeedback.notificationOccurred("success");
        await load();
        return;
      }

      tg?.showAlert("Не удалось удалить афишу");
    });
  };

  if (loading) return <div>Загрузка...</div>;

  if (draft) {
    return (
      <div className="space-y-4">
        <button
          className="flex items-center gap-2 text-[var(--tg-theme-button-color)]"
          type="button"
          onClick={() => setDraft(null)}
        >
          <ChevronLeft size={18} /> К списку афиш
        </button>

        <h1 className="text-xl font-bold">{draft.id ? "Правка афиши" : "Новая афиша"}</h1>

        {templates.length > 0 ? (
          <div>
            <FieldLabel title="Шаблон" />
            <select
              className={textFieldClass}
              value=""
              onChange={(event) => applyTemplate(event.target.value)}
            >
              <option value="">Выбрать сохранённый…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--tg-theme-hint-color)]">
              Подставит всё, кроме даты и времени.
            </p>
          </div>
        ) : null}

        <FieldLabel title="Название" />
        <input
          className={textFieldClass}
          maxLength={80}
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
        />

        <FieldLabel title="Плашка" />
        <input
          className={textFieldClass}
          maxLength={40}
          value={draft.badge}
          onChange={(event) => update({ badge: event.target.value })}
        />

        <FieldLabel title="Начало (МСК)" />
        <input
          className={textFieldClass}
          type="datetime-local"
          value={draft.startsAt}
          onChange={(event) => update({ startsAt: event.target.value })}
        />

        <FieldLabel title="Вход до (МСК)" />
        <input
          className={textFieldClass}
          type="datetime-local"
          value={draft.lateEntryUntil}
          onChange={(event) => update({ lateEntryUntil: event.target.value })}
        />

        <div className="grid grid-cols-3 gap-2">
          <div>
            <FieldLabel title="Обычных мест" />
            <input
              className={textFieldClass}
              inputMode="numeric"
              value={draft.maxPlayers}
              onChange={(event) => update({ maxPlayers: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel title="VIP-мест" />
            <input
              className={textFieldClass}
              inputMode="numeric"
              value={draft.maxVipPlayers}
              onChange={(event) => update({ maxVipPlayers: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel title="Стек" />
            <input
              className={textFieldClass}
              inputMode="numeric"
              value={draft.startingStack}
              onChange={(event) => update({ startingStack: event.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel title="Обычный билет ₽" />
            <input
              className={textFieldClass}
              inputMode="numeric"
              value={draft.buyIn}
              onChange={(event) => update({ buyIn: event.target.value })}
            />
          </div>
          <div>
            <FieldLabel title="VIP билет ₽" />
            <input
              className={textFieldClass}
              inputMode="numeric"
              value={draft.vipBuyIn}
              onChange={(event) => update({ vipBuyIn: event.target.value })}
            />
          </div>
        </div>

        <FieldLabel title="Адрес" />
        <input
          className={textFieldClass}
          maxLength={200}
          value={draft.venueAddress}
          onChange={(event) => update({ venueAddress: event.target.value })}
        />

        <FieldLabel title="Общие правила" />
        <textarea
          className={`min-h-24 ${textFieldClass}`}
          maxLength={2000}
          value={draft.rulesText}
          onChange={(event) => update({ rulesText: event.target.value })}
        />

        <FieldLabel title="Особенности" />
        <textarea
          className={`min-h-32 ${textFieldClass}`}
          maxLength={4000}
          value={draft.featuresText}
          onChange={(event) => update({ featuresText: event.target.value })}
        />
        <p className="text-xs text-[var(--tg-theme-hint-color)]">
          Каждая строка выводится игроку отдельным пунктом.
        </p>

        <FieldLabel title="Афиша" />
        <input
          ref={posterInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) pickPoster(file);
          }}
        />
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--tg-theme-hint-color)]/30 p-3 text-sm text-[var(--tg-theme-button-color)]"
          type="button"
          onClick={() => posterInputRef.current?.click()}
        >
          <ImageIcon size={16} />
          {draft.posterDataUrl
            ? "Новая картинка выбрана"
            : draft.posterUrl
              ? "Заменить картинку"
              : "Загрузить картинку"}
        </button>
        {draft.posterDataUrl || draft.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Афиша"
            className="max-h-40 w-full rounded-lg object-cover"
            src={draft.posterDataUrl || draft.posterUrl}
          />
        ) : null}

        <label className="flex items-center gap-3 py-2">
          <input
            checked={draft.isPublished}
            className="h-5 w-5"
            type="checkbox"
            onChange={(event) => update({ isPublished: event.target.checked })}
          />
          <span className="text-sm">Показывать игрокам</span>
        </label>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] px-4 py-3 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
          disabled={saving}
          type="button"
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : null}
          {draft.id ? "Сохранить афишу" : "Создать афишу"}
        </button>

        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] px-4 py-3 text-sm font-semibold disabled:opacity-60"
          disabled={saving || !draft.title.trim()}
          type="button"
          onClick={saveTemplate}
        >
          <Copy size={16} /> Сохранить как шаблон
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <CalendarPlus size={20} /> Афиши
        </h1>
        <button
          aria-label="Новая афиша"
          className="bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] p-2 rounded-full"
          type="button"
          onClick={() => setDraft(EMPTY_DRAFT)}
        >
          <CalendarPlus size={20} />
        </button>
      </div>

      {events.length === 0 ? (
        <div className="py-10 text-center text-[var(--tg-theme-hint-color)]">
          Пока ни одной афиши. Создайте первую кнопкой сверху.
        </div>
      ) : null}

      <div className="space-y-2">
        {events.map((event) => (
          <div key={event.id} className="bg-[var(--tg-theme-secondary-bg-color)] p-4 rounded-lg space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{event.title}</p>
                <p className="text-xs text-[var(--tg-theme-hint-color)]">
                  {formatEventDayLabel(event.startsAt)}, {formatEventTimeLabel(event.startsAt)}
                </p>
              </div>
              <span className="shrink-0 text-xs flex items-center gap-1 text-[var(--tg-theme-hint-color)]">
                <Users size={13} /> {event.signupsCount}
                {event.maxPlayers ? ` / ${event.maxPlayers}` : ""}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-1 rounded p-2 text-sm bg-[var(--tg-theme-bg-color)]"
                type="button"
                onClick={() => setDraft(toDraft(event))}
              >
                <Pencil size={14} /> Правка
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-1 rounded p-2 text-sm bg-[var(--tg-theme-bg-color)]"
                type="button"
                onClick={() => void togglePublished(event)}
              >
                {event.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                {event.isPublished ? "Скрыть" : "Показать"}
              </button>
              <button
                className="flex items-center justify-center rounded p-2 text-sm bg-[var(--tg-theme-bg-color)] text-red-400"
                type="button"
                onClick={() => remove(event)}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {!event.isPublished ? (
              <p className="text-xs text-[var(--tg-theme-hint-color)]">Черновик — игроки не видят</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldLabel({ title }: { title: string }): ReactNode {
  return <p className="pt-2 text-sm font-medium text-[var(--tg-theme-hint-color)]">{title}</p>;
}
