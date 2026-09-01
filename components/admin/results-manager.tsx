"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2, Trophy } from "lucide-react";
import { deleteGameResults, saveGameResults } from "@/app/admin/results/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import { formatEventDayLabel, formatEventTimeLabel } from "@/lib/events/types";

type GameSummary = { playedOn: string; players: number; startedAt: string; title: string };

type ResultRow = {
  knockouts: number;
  place: number | null;
  playerName: string;
  points: number;
  telegramId: number | null;
};

type DraftRow = {
  knockouts: string;
  place: string;
  playerName: string;
  points: string;
  telegramId: number | null;
};

function toDraft(row: ResultRow): DraftRow {
  return {
    knockouts: String(row.knockouts ?? 0),
    place: row.place ? String(row.place) : "",
    playerName: row.playerName,
    points: String(row.points ?? 0),
    telegramId: row.telegramId,
  };
}

export function ResultsManager({
  games,
  rows,
  selectedGame,
}: {
  games: GameSummary[];
  rows: ResultRow[];
  selectedGame: string | null;
}) {
  const [draft, setDraft] = useState<DraftRow[]>(() => rows.map(toDraft));
  const game = games.find((item) => item.startedAt === selectedGame) ?? null;

  const payload = useMemo(
    () =>
      JSON.stringify(
        draft.map((row) => ({
          knockouts: row.knockouts === "" ? 0 : row.knockouts,
          place: row.place === "" ? null : row.place,
          playerName: row.playerName,
          points: row.points === "" ? 0 : row.points,
          telegramId: row.telegramId,
        })),
      ),
    [draft],
  );

  const update = (index: number, patch: Partial<DraftRow>) =>
    setDraft((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="settings-stack">
      <section className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>Результаты игр</h2>
            <p className="muted">
              Правка итогов после игры: рейтинг и история пересчитываются сразу, ничего
              обновлять не нужно.
            </p>
          </div>
        </div>

        {games.length === 0 ? (
          <p className="muted">
            <Trophy size={16} /> Сыгранных турниров пока нет.
          </p>
        ) : (
          <div className="results-games">
            {games.map((item) => (
              <Link
                key={item.startedAt}
                className={`results-game${item.startedAt === selectedGame ? " results-game-active" : ""}`}
                href={`/admin/results?game=${encodeURIComponent(item.startedAt)}`}
              >
                <strong>{item.title}</strong>
                <span className="muted">
                  {formatEventDayLabel(item.playedOn)}, {formatEventTimeLabel(item.startedAt)} ·{" "}
                  {item.players} чел.
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {game ? (
        <form action={saveGameResults} className="poker-panel">
          <div className="panel-heading">
            <div>
              <h2>{game.title}</h2>
              <p className="muted">
                {formatEventDayLabel(game.playedOn)} · {draft.length} участников
              </p>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  { knockouts: "0", place: "", playerName: "", points: "0", telegramId: null },
                ])
              }
            >
              <Plus size={16} /> Добавить игрока
            </button>
          </div>

          <input name="startedAt" type="hidden" value={game.startedAt} />
          <input name="rows" type="hidden" value={payload} />

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Игрок</th>
                  <th>Очки</th>
                  <th>Нокауты</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {draft.map((row, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        className="results-input results-input-narrow"
                        inputMode="numeric"
                        value={row.place}
                        onChange={(event) => update(index, { place: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="results-input"
                        value={row.playerName}
                        onChange={(event) => update(index, { playerName: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="results-input results-input-narrow"
                        inputMode="decimal"
                        value={row.points}
                        onChange={(event) => update(index, { points: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="results-input results-input-narrow"
                        inputMode="decimal"
                        value={row.knockouts}
                        onChange={(event) => update(index, { knockouts: event.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        aria-label="Удалить строку"
                        className="ghost-button"
                        type="button"
                        onClick={() => setDraft((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="results-actions">
            <SubmitButton className="gold-button" pendingText="Сохраняем...">
              Сохранить результаты
            </SubmitButton>
          </div>

          <p className="field-help">
            Игрок без номера места в рейтинг за это место очков не получит — очки берутся из
            колонки «Очки». Пустая строка игнорируется.
          </p>
        </form>
      ) : null}

      {game ? (
        <form action={deleteGameResults} className="poker-panel">
          <div className="panel-heading">
            <div>
              <h2>Удалить игру</h2>
              <p className="muted">
                Стирает результаты этого вечера целиком — из рейтинга и из истории игроков.
              </p>
            </div>
          </div>
          <input name="startedAt" type="hidden" value={game.startedAt} />
          <SubmitButton className="ghost-button" pendingText="Удаляем...">
            <Trash2 size={14} /> Удалить результаты игры
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
