"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarPlus,
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
import { MoreTabs } from "../more-tabs";
import { ScreenHeader, SectionLabel, ToggleRow } from "../ui";
import { utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";
import { addMinutesToMoscowLocal, type EventTemplate } from "@/lib/events/templates";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  isReservableTicket,
  type ReservableTicket,
  type TournamentEvent,
} from "@/lib/events/types";
import { describeAnnouncedSeats } from "@/lib/events/seats";
import type { Reservation } from "@/lib/events/reservations";
import { toOwnOriginMediaUrl } from "@/lib/media/own-origin-url";
import { shrinkPhoto } from "@/lib/media/shrink-photo";

type EventRow = TournamentEvent & {
  /** When a draft goes up by itself; null when it waits for the admin. */
  publishAt: string | null;
  signupsCount: number;
};


/**
 * The longest side of a poster sent. The server keeps no more than this anyway
 * (LOGO_MAX_DIMENSION in lib/admin/logo-upload.ts — not imported: it pulls in sharp).
 */
const POSTER_MAX_SIDE = 1200;
/** A shade higher than a profile photo's: the poster is shown full width. */
const POSTER_QUALITY = 0.9;
/** A 413 is Vercel's answer, not ours, so it carries no message of its own. */
const POSTER_TOO_BIG = "Картинка афиши слишком большая — выберите файл поменьше";

// The club's standing prices; an admin can still change them per tournament.
const DEFAULT_BUY_IN = "1250";
const DEFAULT_VIP_BUY_IN = "2000";
const DEFAULT_DUO_BUY_IN = "2000";

const EMPTY_DRAFT = {
  badge: "",
  buyIn: DEFAULT_BUY_IN,
  duoBuyIn: DEFAULT_DUO_BUY_IN,
  featuresText: "",
  id: "",
  isPublished: false,
  lateEntryUntil: "",
  maxDuoTickets: "",
  maxPlayers: "",
  maxVipPlayers: "",
  posterDataUrl: "",
  posterUrl: "",
  publishAt: "",
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
    duoBuyIn: event.duoBuyIn ? String(event.duoBuyIn) : "",
    featuresText: event.featuresText,
    id: event.id,
    isPublished: event.isPublished,
    lateEntryUntil: event.lateEntryUntil ? utcISOToMoscowLocal(event.lateEntryUntil) : "",
    maxDuoTickets: event.maxDuoTickets ? String(event.maxDuoTickets) : "",
    maxPlayers: event.maxPlayers ? String(event.maxPlayers) : "",
    maxVipPlayers: event.maxVipPlayers ? String(event.maxVipPlayers) : "",
    posterDataUrl: "",
    posterUrl: event.posterUrl ?? "",
    publishAt: event.publishAt ? utcISOToMoscowLocal(event.publishAt) : "",
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
  // Tickets the club is holding for regulars who asked ahead, for the poster on screen.
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservedNickname, setReservedNickname] = useState("");
  const [reservedTicket, setReservedTicket] = useState<ReservableTicket>("regular");
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

  const loadReservations = useCallback(
    async (eventId: string) => {
      const res = await fetch(`/api/tma/event-reservations?eventId=${eventId}`, {
        headers: { "X-Telegram-Init-Data": initData },
      });

      setReservations(res.ok ? ((await res.json()).reservations ?? []) : []);
    },
    [initData],
  );

  /** Holds a ticket, or takes one back; either way the list is what comes back. */
  const changeReservations = async (request: RequestInit & { url: string }) => {
    const tg = getTelegramWebApp();
    const { url, ...init } = request;
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      tg?.HapticFeedback.notificationOccurred("error");
      tg?.showAlert(data?.error ?? "Не удалось изменить отложенные билеты");
      return;
    }

    tg?.HapticFeedback.notificationOccurred("success");
    setReservations(data?.reservations ?? []);
    setReservedNickname("");
    await load();
  };

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
          duoBuyIn: draft.duoBuyIn ? Number(draft.duoBuyIn) : null,
          featuresText: draft.featuresText,
          lateEntryUntil: draft.lateEntryUntil,
          maxDuoTickets: draft.maxDuoTickets ? Number(draft.maxDuoTickets) : null,
          maxPlayers: draft.maxPlayers ? Number(draft.maxPlayers) : null,
          maxVipPlayers: draft.maxVipPlayers ? Number(draft.maxVipPlayers) : null,
          name: draft.title,
          // A picture chosen but not yet saved would otherwise be lost from the
          // template, which is the one thing every poster of the club shares.
          posterDataUrl: draft.posterDataUrl || undefined,
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
        tg?.showAlert(
          data?.error ?? (res.status === 413 ? POSTER_TOO_BIG : "Не удалось сохранить шаблон"),
        );
        return;
      }

      setTemplates(data.templates ?? []);
      tg?.HapticFeedback.notificationOccurred("success");
    } finally {
      setSaving(false);
    }
  };

  const pickPoster = async (file: File) => {
    // Shrunk on the phone: a poster straight from a camera or a designer runs to several
    // megabytes, and a request over 4.5 MB is turned away before it reaches the club. A
    // picture the browser cannot open goes as it is, and the server says what is wrong.
    const shrunk = await shrinkPhoto(file, { maxSide: POSTER_MAX_SIDE, quality: POSTER_QUALITY });
    if (shrunk) {
      update({ posterDataUrl: shrunk });
      return;
    }

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
        duoBuyIn: draft.duoBuyIn ? Number(draft.duoBuyIn) : null,
        featuresText: draft.featuresText,
        isPublished: draft.isPublished,
        lateEntryUntil: draft.lateEntryUntil,
        maxDuoTickets: draft.maxDuoTickets ? Number(draft.maxDuoTickets) : null,
        maxPlayers: draft.maxPlayers ? Number(draft.maxPlayers) : null,
        maxVipPlayers: draft.maxVipPlayers ? Number(draft.maxVipPlayers) : null,
        posterDataUrl: draft.posterDataUrl || undefined,
        posterUrl: draft.posterUrl,
        // Only a draft waits for a time of its own.
        publishAt: draft.isPublished ? "" : draft.publishAt,
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
      tg?.showAlert(
        data?.error ?? (res.status === 413 ? POSTER_TOO_BIG : "Не удалось сохранить афишу"),
      );
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

  if (loading) return <div className="tma-empty">Загрузка…</div>;

  if (draft) {
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{ label: "Афиши", onClick: () => setDraft(null) }}
          title={draft.id ? "Правка афиши" : "Новая афиша"}
        />

        {templates.length > 0 ? (
          <Field hint="Подставит всё, кроме даты и времени." title="Шаблон">
            <select value="" onChange={(event) => applyTemplate(event.target.value)}>
              <option value="">Выбрать сохранённый…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <SectionLabel title="Основное" />
        <div className="tma-card">
          <Field title="Название">
            <input
              maxLength={80}
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </Field>
          <Field title="Плашка">
            <input
              maxLength={40}
              value={draft.badge}
              onChange={(event) => update({ badge: event.target.value })}
            />
          </Field>
          {/* One under the other: a phone's date and time field needs the whole width. */}
          <div className="flex flex-col gap-2.5">
            <Field title="Начало (МСК)">
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) => update({ startsAt: event.target.value })}
              />
            </Field>
            <Field title="Вход до (МСК)">
              <input
                type="datetime-local"
                value={draft.lateEntryUntil}
                onChange={(event) => update({ lateEntryUntil: event.target.value })}
              />
            </Field>
          </div>
        </div>

        <SectionLabel title="Места и цены" />
        <div className="tma-card">
          <div className="grid grid-cols-3 gap-2">
            <Field title="Обычных мест">
              <input
                inputMode="numeric"
                value={draft.maxPlayers}
                onChange={(event) => update({ maxPlayers: event.target.value })}
              />
            </Field>
            <Field title="VIP-мест">
              <input
                inputMode="numeric"
                value={draft.maxVipPlayers}
                onChange={(event) => update({ maxVipPlayers: event.target.value })}
              />
            </Field>
            <Field title="Стек">
              <input
                inputMode="numeric"
                value={draft.startingStack}
                onChange={(event) => update({ startingStack: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field title="Обычный билет ₽">
              <input
                inputMode="numeric"
                value={draft.buyIn}
                onChange={(event) => update({ buyIn: event.target.value })}
              />
            </Field>
            <Field title="VIP билет ₽">
              <input
                inputMode="numeric"
                value={draft.vipBuyIn}
                onChange={(event) => update({ vipBuyIn: event.target.value })}
              />
            </Field>
            <Field title="Билетов 1+1">
              <input
                inputMode="numeric"
                value={draft.maxDuoTickets}
                onChange={(event) => update({ maxDuoTickets: event.target.value })}
              />
            </Field>
            <Field title="Билет 1+1 ₽ за двоих">
              <input
                inputMode="numeric"
                value={draft.duoBuyIn}
                onChange={(event) => update({ duoBuyIn: event.target.value })}
              />
            </Field>
          </div>
          <p className="tma-hint">
            {describeAnnouncedSeats({
              duoTickets: Number(draft.maxDuoTickets) || 0,
              regular: Number(draft.maxPlayers) || 0,
              vip: Number(draft.maxVipPlayers) || 0,
            })}
          </p>
        </div>

        <SectionLabel title="Описание" />
        <div className="tma-card">
          <Field title="Адрес">
            <input
              maxLength={200}
              value={draft.venueAddress}
              onChange={(event) => update({ venueAddress: event.target.value })}
            />
          </Field>
          <Field title="Общие правила">
            <textarea
              className="min-h-24"
              maxLength={2000}
              value={draft.rulesText}
              onChange={(event) => update({ rulesText: event.target.value })}
            />
          </Field>
          <Field hint="Каждая строка выводится игроку отдельным пунктом." title="Особенности">
            <textarea
              className="min-h-32"
              maxLength={4000}
              value={draft.featuresText}
              onChange={(event) => update({ featuresText: event.target.value })}
            />
          </Field>
        </div>

        <SectionLabel title="Картинка афиши" />
        <input
          ref={posterInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pickPoster(file);
          }}
        />
        {draft.posterDataUrl || draft.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Афиша"
            className="max-h-48 w-full rounded-[14px] object-cover"
            src={draft.posterDataUrl || toOwnOriginMediaUrl(draft.posterUrl)}
          />
        ) : null}
        <button className="tma-btn tma-btn--link" type="button" onClick={() => posterInputRef.current?.click()}>
          <ImageIcon size={16} />
          {draft.posterDataUrl
            ? "Новая картинка выбрана"
            : draft.posterUrl
              ? "Заменить картинку"
              : "Загрузить картинку"}
        </button>

        {/* Somebody writes days ahead asking for a seat. The ticket is held here, and
            the player hears about it the moment the poster goes up. */}
        <SectionLabel meta="только резиденты" title="Отложенные билеты" />
        <div className="tma-card">
          {draft.id ? (
            <>
              {reservations.length > 0 ? (
                <div className="tma-card tma-card--flush tma-card--inset">
                  {reservations.map((held) => (
                    <div key={held.id} className="tma-row">
                      <span className="tma-row__body">
                        <span className="tma-row__title">{held.nickname}</span>
                        <span className="tma-row__sub">
                          {held.ticketType === "vip"
                            ? "VIP"
                            : held.ticketType === "duo"
                              ? "1+1"
                              : "обычный"}{" "}
                          · {held.notified ? "оповещён" : "ждёт публикации"}
                        </span>
                      </span>
                      <button
                        className="tma-btn tma-btn--auto tma-btn--danger-text !min-h-9 !bg-transparent !px-2 !text-sm"
                        type="button"
                        onClick={() =>
                          void changeReservations({
                            method: "DELETE",
                            url: `/api/tma/event-reservations?eventId=${draft.id}&id=${held.id}`,
                          })
                        }
                      >
                        Снять
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="tma-hint">Пока никому не отложено.</p>
              )}

              {/* A nickname needs the whole width to be read back; the ticket is two
                  words and sits under it. */}
              <input
                aria-label="Ник резидента"
                placeholder="Ник резидента"
                value={reservedNickname}
                onChange={(item) => setReservedNickname(item.target.value)}
              />
              <div className="tma-segment">
                {(["regular", "vip", "duo"] as const).map((ticket) => (
                  <button
                    key={ticket}
                    aria-pressed={reservedTicket === ticket}
                    type="button"
                    onClick={() => setReservedTicket(isReservableTicket(ticket) ? ticket : "regular")}
                  >
                    {ticket === "vip" ? "VIP" : ticket === "duo" ? "1+1" : "Обычный"}
                  </button>
                ))}
              </div>

              <button
                className="tma-btn tma-btn--inset tma-btn--link"
                disabled={!reservedNickname.trim()}
                type="button"
                onClick={() =>
                  void changeReservations({
                    body: JSON.stringify({
                      eventId: draft.id,
                      nickname: reservedNickname,
                      ticketType: reservedTicket,
                    }),
                    method: "POST",
                    url: "/api/tma/event-reservations",
                  })
                }
              >
                Отложить билет
              </button>
              <p className="tma-hint">Сообщение уйдёт, когда афишу опубликуют.</p>
            </>
          ) : (
            <p className="tma-hint">Сохраните афишу — и сможете откладывать билеты.</p>
          )}
        </div>

        <SectionLabel title="Публикация" />
        <ToggleRow
          checked={draft.isPublished}
          label="Показывать игрокам"
          onChange={(checked) => update({ isPublished: checked })}
        />

        {/* A draft can go up by itself at a set time; a poster already up has nothing
            left to wait for. */}
        {!draft.isPublished ? (
          <div className="tma-card">
            <Field
              hint={
                draft.publishAt
                  ? "Афиша сама появится у игроков в это время — с задержкой до 5 минут."
                  : "Оставьте пустым, чтобы опубликовать вручную."
              }
              title="Опубликовать автоматически (МСК)"
            >
              <input
                type="datetime-local"
                value={draft.publishAt}
                onChange={(event) => update({ publishAt: event.target.value })}
              />
            </Field>
            {/* A phone's date picker has no way to empty the field once it is set. */}
            {draft.publishAt ? (
              <button
                className="tma-btn tma-btn--ghost tma-btn--link !min-h-9 !text-sm"
                type="button"
                onClick={() => update({ publishAt: "" })}
              >
                Убрать время публикации
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          className="tma-btn tma-btn--link"
          disabled={saving || !draft.title.trim()}
          type="button"
          onClick={saveTemplate}
        >
          <Copy size={16} /> Сохранить как шаблон
        </button>

        <div className="tma-cta-bar">
          <button
            className="tma-btn tma-btn--primary tma-btn--big"
            disabled={saving}
            type="button"
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="animate-spin" size={18} /> : null}
            {draft.id ? "Сохранить афишу" : "Создать афишу"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tma-screen">
      <ScreenHeader title="Ещё" />
      <MoreTabs current="events" />

      <button
        aria-label="Новая афиша"
        className="tma-btn tma-btn--primary"
        type="button"
        onClick={() => {
          setDraft(EMPTY_DRAFT);
          setReservations([]);
        }}
      >
        <CalendarPlus size={18} /> Новая афиша
      </button>

      {events.length === 0 ? (
        <div className="tma-empty">Пока ни одной афиши. Создайте первую кнопкой выше.</div>
      ) : null}

      {events.map((event) => (
        <div key={event.id} className="tma-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-[16px] font-bold">{event.title}</span>
              <span className="tma-hint">
                {formatEventDayLabel(event.startsAt)}, {formatEventTimeLabel(event.startsAt)}
              </span>
            </div>
            {event.isPublished ? (
              <span className="tma-badge tma-badge--green">Опубликована</span>
            ) : (
              <span className="tma-badge">Черновик</span>
            )}
          </div>

          <span className="flex items-center gap-1.5 text-sm">
            <Users className="tma-muted" size={14} /> {event.signupsCount}
            {event.maxPlayers ? ` / ${event.maxPlayers}` : ""} записались
          </span>

          {!event.isPublished ? (
            <span className="tma-hint">
              {event.publishAt
                ? `Опубликуется ${formatEventDayLabel(event.publishAt)} в ${formatEventTimeLabel(event.publishAt)}`
                : "Игроки не видят"}
            </span>
          ) : null}

          <div className="flex gap-2">
            <button
              className="tma-btn tma-btn--inset !min-h-10 flex-1 !text-sm"
              type="button"
              onClick={() => {
                setDraft(toDraft(event));
                void loadReservations(event.id);
              }}
            >
              <Pencil size={14} /> Правка
            </button>
            <button
              className="tma-btn tma-btn--inset !min-h-10 flex-1 !text-sm"
              type="button"
              onClick={() => void togglePublished(event)}
            >
              {event.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
              {event.isPublished ? "Скрыть" : "Показать"}
            </button>
            <button
              aria-label={`Удалить афишу «${event.title}»`}
              className="tma-btn tma-btn--inset tma-btn--auto tma-btn--danger-text !min-h-10"
              type="button"
              onClick={() => remove(event)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A field with its name over it, and an optional line of help under it. */
function Field({ children, hint, title }: { children: ReactNode; hint?: string; title: string }): ReactNode {
  return (
    <label className="tma-field">
      <span className="tma-field__label">{title}</span>
      {children}
      {hint ? <span className="tma-hint text-xs">{hint}</span> : null}
    </label>
  );
}
