"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Pencil, Trash2, Users } from "lucide-react";
import { deleteTournamentEvent, saveTournamentEvent } from "@/app/admin/events/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import type { EventSignupWithPlayer } from "@/lib/events/store";
import { utcISOToMoscowLocal } from "@/lib/client-bot/schedule-time";
import {
  formatEventDayLabel,
  formatEventTimeLabel,
  type TournamentEvent,
} from "@/lib/events/types";

const EMPTY_DRAFT = {
  badge: "",
  buyIn: "",
  featuresText: "",
  id: "",
  isPublished: false,
  lateEntryUntil: "",
  maxPlayers: "",
  posterUrl: "",
  rulesText: "",
  startingStack: "",
  startsAt: "",
  title: "",
  venueAddress: "",
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
    posterUrl: event.posterUrl ?? "",
    rulesText: event.rulesText,
    startingStack: event.startingStack ? String(event.startingStack) : "",
    startsAt: utcISOToMoscowLocal(event.startsAt),
    title: event.title,
    venueAddress: event.venueAddress,
  };
}

export function EventsManager({
  events,
  selectedEventId,
  signupCounts,
  signups,
}: {
  events: TournamentEvent[];
  selectedEventId: string | null;
  signupCounts: Record<string, number>;
  signups: EventSignupWithPlayer[];
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

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
            Мест
            <input
              name="maxPlayers"
              inputMode="numeric"
              placeholder="90"
              value={draft.maxPlayers}
              onChange={(event) => update({ maxPlayers: event.target.value })}
            />
          </label>
          <label>
            Бай-ин, ₽
            <input
              name="buyIn"
              inputMode="numeric"
              placeholder="1500"
              value={draft.buyIn}
              onChange={(event) => update({ buyIn: event.target.value })}
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

        <SubmitButton className="gold-button" pendingText="Сохраняем...">
          {draft.id ? "Сохранить афишу" : "Создать афишу"}
        </SubmitButton>
      </form>

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
