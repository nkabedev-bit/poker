"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Pencil, Trash2, Users } from "lucide-react";
import {
  deleteTournamentEvent,
  deleteTournamentEventTemplate,
  saveTournamentEvent,
  saveTournamentEventTemplate,
} from "@/app/admin/events/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import type { EventSignupWithPlayer } from "@/lib/events/store";
import { utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";
import { addMinutesToMoscowLocal, type EventTemplate } from "@/lib/events/templates";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

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
  posterUrl: "",
  rulesText: "",
  startingStack: "",
  startsAt: "",
  title: "",
  venueAddress: "",
  vipBuyIn: DEFAULT_VIP_BUY_IN,
};

type Draft = typeof EMPTY_DRAFT;

function toDraft(event: TournamentEvent): Draft {
  return {
    badge: event.badge ?? "",
    buyIn: event.buyIn ? String(event.buyIn) : "",
    featuresText: event.featuresText,
    id: event.id,
    isPublished: event.isPublished,
    lateEntryUntil: event.lateEntryUntil ? utcISOToMoscowLocal(event.lateEntryUntil) : "",
    maxPlayers: event.maxPlayers ? String(event.maxPlayers) : "",
    maxVipPlayers: event.maxVipPlayers ? String(event.maxVipPlayers) : "",
    posterUrl: event.posterUrl ?? "",
    rulesText: event.rulesText,
    startingStack: event.startingStack ? String(event.startingStack) : "",
    startsAt: utcISOToMoscowLocal(event.startsAt),
    title: event.title,
    venueAddress: event.venueAddress,
    vipBuyIn: event.vipBuyIn ? String(event.vipBuyIn) : "",
  };
}

export function EventsManager({
  events,
  selectedEventId,
  signupCounts,
  signups,
  templates = [],
}: {
  events: TournamentEvent[];
  selectedEventId: string | null;
  signupCounts: Record<string, number>;
  signups: EventSignupWithPlayer[];
  templates?: EventTemplate[];
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [templateName, setTemplateName] = useState("");

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  /**
   * Fills the form from a saved poster. The date is left alone — it is the one thing
   * that changes from week to week, and it is what the admin came here to type.
   */
  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    setDraft((current) => ({
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
      posterUrl: template.posterUrl ?? "",
      rulesText: template.rulesText,
      startingStack: template.startingStack ? String(template.startingStack) : "",
      title: template.title,
      venueAddress: template.venueAddress,
      vipBuyIn: template.vipBuyIn ? String(template.vipBuyIn) : "",
    }));
    setTemplateName(template.name);
  };

  return (
    <div className="settings-stack">
      <form action={saveTournamentEvent} className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>{draft.id ? "Правка афиши" : "Новая афиша"}</h2>
            <p className="muted">
              Турнир появится в приложении игроков — там на него можно записаться.
            </p>
          </div>
          {draft.id ? (
            <button className="ghost-button" type="button" onClick={() => setDraft(EMPTY_DRAFT)}>
              <CalendarPlus size={16} /> Создать новую
            </button>
          ) : null}
        </div>

        <input name="id" type="hidden" value={draft.id} />
        <input name="posterUrl" type="hidden" value={draft.posterUrl} />

        <div className="events-form-row">
          <label>
            Шаблон
            <select
              value=""
              onChange={(event) => applyTemplate(event.target.value)}
            >
              <option value="">
                {templates.length > 0 ? "Выбрать сохранённый…" : "Шаблонов пока нет"}
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <span className="field-help">
              Подставит всё, кроме даты и времени — их укажите ниже.
            </span>
          </label>
          <label>
            Сохранить как шаблон
            <input
              name="templateName"
              maxLength={48}
              placeholder="Четверговый"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <span className="field-help">
              Имя уже сохранённого шаблона перезапишет его.
            </span>
          </label>
        </div>

        <label>
          Название
          <input
            name="title"
            maxLength={80}
            placeholder="ONE SHOT KNOCKOUT"
            required
            value={draft.title}
            onChange={(event) => update({ title: event.target.value })}
          />
        </label>

        <label>
          Плашка
          <input
            name="badge"
            maxLength={40}
            placeholder="Новый формат!"
            value={draft.badge}
            onChange={(event) => update({ badge: event.target.value })}
          />
          <span className="field-help">Небольшая метка на афише. Можно оставить пустой.</span>
        </label>

        <div className="events-form-row">
          <label>
            Начало (МСК)
            <input
              name="startsAt"
              required
              type="datetime-local"
              value={draft.startsAt}
              onChange={(event) => update({ startsAt: event.target.value })}
            />
          </label>
          <label>
            Вход до (МСК)
            <input
              name="lateEntryUntil"
              type="datetime-local"
              value={draft.lateEntryUntil}
              onChange={(event) => update({ lateEntryUntil: event.target.value })}
            />
          </label>
        </div>

        <div className="events-form-row">
          <label>
            Обычных мест
            <input
              name="maxPlayers"
              inputMode="numeric"
              placeholder="20"
              value={draft.maxPlayers}
              onChange={(event) => update({ maxPlayers: event.target.value })}
            />
          </label>
          <label>
            VIP-мест
            <input
              name="maxVipPlayers"
              inputMode="numeric"
              placeholder="10"
              value={draft.maxVipPlayers}
              onChange={(event) => update({ maxVipPlayers: event.target.value })}
            />
          </label>
          <label>
            Обычный билет, ₽
            <input
              name="buyIn"
              inputMode="numeric"
              value={draft.buyIn}
              onChange={(event) => update({ buyIn: event.target.value })}
            />
          </label>
          <label>
            VIP билет, ₽
            <input
              name="vipBuyIn"
              inputMode="numeric"
              value={draft.vipBuyIn}
              onChange={(event) => update({ vipBuyIn: event.target.value })}
            />
          </label>
          <label>
            Стартовый стек
            <input
              name="startingStack"
              inputMode="numeric"
              placeholder="120000"
              value={draft.startingStack}
              onChange={(event) => update({ startingStack: event.target.value })}
            />
          </label>
        </div>

        <label>
          Адрес
          <input
            name="venueAddress"
            maxLength={200}
            placeholder="Москва, Большая Новодмитровская улица, 36с13"
            value={draft.venueAddress}
            onChange={(event) => update({ venueAddress: event.target.value })}
          />
        </label>

        <label>
          Общие правила
          <textarea
            name="rulesText"
            maxLength={2000}
            placeholder="Один шанс доказать своё превосходство!"
            rows={3}
            value={draft.rulesText}
            onChange={(event) => update({ rulesText: event.target.value })}
          />
        </label>

        <label>
          Особенности
          <textarea
            name="featuresText"
            maxLength={4000}
            placeholder={"Без re-entry, без аддонов\nФишка за выбивание +50 очков"}
            rows={6}
            value={draft.featuresText}
            onChange={(event) => update({ featuresText: event.target.value })}
          />
          <span className="field-help">Каждая строка выводится отдельным пунктом.</span>
        </label>

        <label>
          Афиша
          <input accept="image/*" name="poster" type="file" />
          <span className="field-help">
            {draft.posterUrl ? "Уже загружена — новый файл заменит её." : "PNG или JPG до 5 МБ."}
          </span>
          {/* Applying a template brings its picture along, and without this the form
              gave no sign of it. */}
          {draft.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="Афиша турнира"
              className="event-poster-preview"
              src={draft.posterUrl}
            />
          ) : null}
        </label>

        <label className="checkbox-field">
          <input
            checked={draft.isPublished}
            name="isPublished"
            type="checkbox"
            value="yes"
            onChange={(event) => update({ isPublished: event.target.checked })}
          />
          Показывать игрокам
        </label>

        <div className="qr-actions">
          <SubmitButton className="gold-button" pendingText="Сохраняем...">
            {draft.id ? "Сохранить афишу" : "Создать афишу"}
          </SubmitButton>
          <SubmitButton
            className="ghost-button"
            formAction={saveTournamentEventTemplate}
            pendingText="Сохраняем шаблон..."
          >
            Сохранить как шаблон
          </SubmitButton>
        </div>
      </form>

      {templates.length > 0 ? (
        <section className="poker-panel">
          <div className="panel-heading">
            <div>
              <h2>Шаблоны афиш ({templates.length})</h2>
              <p className="muted">
                Выберите шаблон в форме выше — подставится всё, кроме даты и времени.
              </p>
            </div>
          </div>

          <ul className="event-template-list">
            {templates.map((template) => (
              <li key={template.id}>
                <button type="button" onClick={() => applyTemplate(template.id)}>
                  <strong>{template.name}</strong>
                  <span className="muted">{template.title}</span>
                </button>
                <form action={deleteTournamentEventTemplate}>
                  <input name="templateId" type="hidden" value={template.id} />
                  <SubmitButton className="ghost-button" pendingText="...">
                    <Trash2 size={15} />
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>Афиши ({events.length})</h2>
            <p className="muted">Ближайшие сверху. Цифра — сколько человек записалось.</p>
          </div>
        </div>

        {events.length === 0 ? (
          <p className="muted">Пока ни одной афиши. Создайте первую в форме выше.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Турнир</th>
                  <th>Когда</th>
                  <th>Записалось</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      {event.badge ? <span className="muted"> · {event.badge}</span> : null}
                    </td>
                    <td>
                      {formatEventDayLabel(event.startsAt)}, {formatEventTimeLabel(event.startsAt)}
                    </td>
                    <td>
                      <Link href={`/admin/events?event=${event.id}`}>
                        <Users size={14} /> {signupCounts[event.id] ?? 0}
                        {event.maxPlayers ? ` / ${event.maxPlayers}` : ""}
                      </Link>
                    </td>
                    <td>{event.isPublished ? "Опубликована" : "Черновик"}</td>
                    <td className="events-row-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setDraft(toDraft(event))}
                      >
                        <Pencil size={14} /> Правка
                      </button>
                      <form action={deleteTournamentEvent}>
                        <input name="id" type="hidden" value={event.id} />
                        <SubmitButton className="ghost-button" pendingText="Удаляем...">
                          <Trash2 size={14} /> Удалить
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedEventId ? (
        <section className="poker-panel">
          <div className="panel-heading">
            <div>
              <h2>Записались ({signups.length})</h2>
              <p className="muted">
                Заявки на выбранный турнир. Посадить за стол можно в админ-боте.
              </p>
            </div>
            <Link className="ghost-button" href="/admin/events">
              Скрыть
            </Link>
          </div>

          {signups.length === 0 ? (
            <p className="muted">Пока никто не записался.</p>
          ) : (
            <ol className="events-signups">
              {signups.map((signup, index) => (
                <li key={signup.id}>
                  <span className="muted">{index + 1}.</span>{" "}
                  <strong>{signup.displayName ?? `id ${signup.telegramId}`}</strong>
                  {signup.username ? <span className="muted"> @{signup.username}</span> : null}
                  {signup.status === "seated" ? <span className="muted"> · за столом</span> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
