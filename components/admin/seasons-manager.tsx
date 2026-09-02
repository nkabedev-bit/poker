"use client";

import { CalendarPlus, Link2, Lock, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import {
  attachGamesByDate,
  closeSeason,
  openSeason,
  recomputeSeason,
  updateSeason,
} from "@/app/admin/seasons/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import type { Season } from "@/lib/seasons/season";

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function SeasonsManager({
  gamesBySeason,
  gamesWithoutSeason,
  seasons,
}: {
  gamesBySeason: Record<string, number>;
  gamesWithoutSeason: number;
  seasons: Season[];
}) {
  const [editing, setEditing] = useState<Season | null>(null);
  const open = seasons.find((season) => season.status === "open") ?? null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="settings-stack">
      <form action={openSeason} className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>Открыть сезон</h2>
            <p className="muted">
              Игроки увидят это название в приложении. Игры, сыгранные при открытом
              сезоне, попадают в него автоматически.
            </p>
          </div>
        </div>

        <label>
          Название
          <input maxLength={80} name="title" placeholder="Осенняя серия" required />
        </label>

        <div className="events-form-row">
          <label>
            Начало
            <input defaultValue={today} name="startsOn" required type="date" />
          </label>
          <label>
            Игр в зачёт
            <input inputMode="numeric" name="countedGames" placeholder="все" />
            <span className="field-help">
              Пусто — считаются все игры сезона. Число — столько лучших.
            </span>
          </label>
        </div>

        {open ? (
          <p className="field-help">
            Сейчас открыт «{open.title}». Он будет закрыт и заморожен датой начала нового.
          </p>
        ) : null}

        <SubmitButton className="gold-button" pendingText="Открываем...">
          <CalendarPlus size={16} /> Открыть сезон
        </SubmitButton>
      </form>

      {editing ? (
        <form action={updateSeason} className="poker-panel">
          <div className="panel-heading">
            <div>
              <h2>Правка сезона</h2>
              <p className="muted">
                Изменили зачёт — нажмите потом «Пересчитать», чтобы итоги пересобрались
                из игр по новому правилу.
              </p>
            </div>
            <button className="ghost-button" type="button" onClick={() => setEditing(null)}>
              Отмена
            </button>
          </div>

          <input name="id" type="hidden" value={editing.id} />

          <label>
            Название
            <input defaultValue={editing.title} maxLength={80} name="title" required />
          </label>

          <div className="events-form-row">
            <label>
              Начало
              <input defaultValue={editing.startsOn} name="startsOn" required type="date" />
            </label>
            <label>
              Конец
              <input defaultValue={editing.endsOn ?? ""} name="endsOn" type="date" />
            </label>
            <label>
              Игр в зачёт
              <input
                defaultValue={editing.countedGames ?? ""}
                inputMode="numeric"
                name="countedGames"
                placeholder="все"
              />
              <span className="field-help">Пусто — все игры сезона.</span>
            </label>
          </div>

          <SubmitButton className="gold-button" pendingText="Сохраняем...">
            Сохранить сезон
          </SubmitButton>
        </form>
      ) : null}

      <section className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>Сезоны ({seasons.length})</h2>
            <p className="muted">
              {gamesWithoutSeason > 0
                ? `Игр без сезона: ${gamesWithoutSeason}. Кнопка «Привязать игры» заберёт те, что попадают в даты сезона.`
                : "Все игры распределены по сезонам."}
            </p>
          </div>
        </div>

        {seasons.length === 0 ? (
          <p className="muted">Сезонов пока нет. Откройте первый в форме выше.</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Сезон</th>
                  <th>Даты</th>
                  <th>Зачёт</th>
                  <th>Игр</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((season) => (
                  <tr key={season.id}>
                    <td>
                      <strong>{season.title}</strong>
                    </td>
                    <td>
                      {formatDate(season.startsOn)} — {formatDate(season.endsOn)}
                    </td>
                    <td>{season.countedGames ?? "все"}</td>
                    <td>{gamesBySeason[season.id] ?? 0}</td>
                    <td>{season.status === "open" ? "идёт" : "закрыт"}</td>
                    <td className="events-row-actions">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setEditing(season)}
                      >
                        <Pencil size={14} /> Правка
                      </button>

                      <form action={attachGamesByDate}>
                        <input name="id" type="hidden" value={season.id} />
                        <SubmitButton className="ghost-button" pendingText="Привязываем...">
                          <Link2 size={14} /> Привязать игры
                        </SubmitButton>
                      </form>

                      {season.status === "open" ? (
                        <form action={closeSeason}>
                          <input name="id" type="hidden" value={season.id} />
                          <input name="endsOn" type="hidden" value={today} />
                          <SubmitButton className="ghost-button" pendingText="Закрываем...">
                            <Lock size={14} /> Закрыть
                          </SubmitButton>
                        </form>
                      ) : (
                        <form action={recomputeSeason}>
                          <input name="id" type="hidden" value={season.id} />
                          <SubmitButton className="ghost-button" pendingText="Считаем...">
                            <RefreshCw size={14} /> Пересчитать
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="field-help">
          Закрытый сезон заморожен: правки старых игр его не меняют, пока не нажать
          «Пересчитать». Если игр у сезона нет — например, итоги перенесены из клубной
          таблицы, а сами игры не сохранились, — пересчёт ничего не тронет: таблица
          останется той, что импортирована.
        </p>
      </section>
    </div>
  );
}
