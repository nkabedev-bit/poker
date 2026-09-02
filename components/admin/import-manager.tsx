"use client";

import { useState } from "react";
import { Download, Eye, ImageDown, Loader2 } from "lucide-react";

type GamePreview = {
  playedOn: string;
  players: number;
  sample: Array<{ knockouts: number; place: number; playerName: string; points: number }>;
  sheetName: string;
};

type MonthPreview = {
  headers?: string[];
  month: string;
  pointsHeading?: string | null;
  players: number;
  sample: Array<{ knockouts: number; playerName: string; points: number }>;
  sheetName: string;
};

type SkippedSheet = { reason: string; sheetName: string };

type Preview = {
  games: GamePreview[];
  months: MonthPreview[];
  skippedMonths?: SkippedSheet[];
  year: number;
};

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function ImportManager() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [preview, setPreview] = useState<Preview | null>(null);
  // Sheets the admin has unticked: skipped outright, or imported as a fun game.
  const [skip, setSkip] = useState<string[]>([]);
  const [fun, setFun] = useState<string[]>([]);
  // Which column of a month sheet holds the score that counted, per sheet.
  const [points, setPoints] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarsBusy, setAvatarsBusy] = useState(false);

  async function loadPreview() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/admin/import-history?year=${encodeURIComponent(year)}&points=${encodeURIComponent(
          JSON.stringify(points),
        )}`,
      );
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Не удалось прочитать таблицы");
        return;
      }

      setPreview(data);
      setSkip([]);
      setFun([]);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/import-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fun, points, skip, year: Number(year) }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Импорт не удался");
        return;
      }

      setMessage(
        `Перенесено: игр ${data.games} (${data.gameRows} строк), месяцев ${data.months} (${data.monthRows} строк).`,
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Walks the whole roster in batches until Telegram has been asked about everyone:
   * a hundred downloads do not fit in one request, so the endpoint reports what is
   * left and the loop keeps going.
   */
  async function syncAvatars(force: boolean) {
    setAvatarsBusy(true);
    setAvatarMessage("Забираем фото…");

    let updated = 0;
    let withoutPhoto = 0;

    try {
      for (let pass = 0; pass < 60; pass += 1) {
        const res = await fetch("/api/admin/sync-avatars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const data = await res.json();

        if (!res.ok) {
          setAvatarMessage(data.error ?? "Не удалось забрать фото");
          return;
        }

        updated += data.updated;
        withoutPhoto += data.withoutPhoto;
        setAvatarMessage(`Обработано игроков: ${updated + withoutPhoto}, осталось: ${data.remaining}`);

        if (data.processed === 0 || data.remaining === 0) break;
      }

      setAvatarMessage(
        `Готово. Фото получено у ${updated} игроков, без фото — ${withoutPhoto} (скрыто настройками или его нет).`,
      );
    } finally {
      setAvatarsBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <section className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>Импорт истории из таблиц</h2>
            <p className="muted">
              Игры переносятся как результаты турниров, месячные листы рейтинга — как архив.
              Сначала посмотрите, что распозналось, и только потом импортируйте.
            </p>
          </div>
        </div>

        <label>
          Год для листов без года
          <input
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
          <span className="field-help">
            Листы игр названы датой без года («01/09»), поэтому год берётся отсюда.
          </span>
        </label>

        <div className="qr-actions">
          <button className="gold-button" disabled={busy} type="button" onClick={() => void loadPreview()}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Eye size={16} />} Посмотреть
          </button>
          <button
            className="ghost-button"
            disabled={busy || !preview}
            type="button"
            onClick={() => void runImport()}
          >
            <Download size={16} /> Импортировать
          </button>
        </div>

        {message ? <p className="admin-action-message">{message}</p> : null}
      </section>

      <section className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>Фото игроков</h2>
            <p className="muted">
              Фото подтягиваются, когда игрок заходит в приложение. Этот прогон спросит
              Telegram обо всех сразу — удобно один раз после запуска.
            </p>
          </div>
        </div>

        <div className="qr-actions">
          <button
            className="gold-button"
            disabled={avatarsBusy}
            type="button"
            onClick={() => void syncAvatars(false)}
          >
            {avatarsBusy ? <Loader2 className="animate-spin" size={16} /> : <ImageDown size={16} />}{" "}
            Забрать недостающие
          </button>
          <button
            className="ghost-button"
            disabled={avatarsBusy}
            type="button"
            onClick={() => void syncAvatars(true)}
          >
            Обновить у всех
          </button>
        </div>

        {avatarMessage ? <p className="admin-action-message">{avatarMessage}</p> : null}
      </section>

      {preview ? (
        <section className="poker-panel">
          <div className="panel-heading">
            <div>
              <h2>Игры ({preview.games.length})</h2>
              <p className="muted">
                Снимите «Импорт», чтобы пропустить лист совсем. Снимите «В зачёт» для
                фан-игры: она попадёт в историю игроков, но не в рейтинг.
              </p>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Импорт</th>
                  <th>В зачёт</th>
                  <th>Лист</th>
                  <th>Дата</th>
                  <th>Игроков</th>
                  <th>Первые строки</th>
                </tr>
              </thead>
              <tbody>
                {preview.games.map((game) => (
                  <tr key={game.sheetName}>
                    <td>
                      <input
                        checked={!skip.includes(game.sheetName)}
                        type="checkbox"
                        onChange={() => setSkip((current) => toggle(current, game.sheetName))}
                      />
                    </td>
                    <td>
                      <input
                        checked={!fun.includes(game.sheetName)}
                        disabled={skip.includes(game.sheetName)}
                        type="checkbox"
                        onChange={() => setFun((current) => toggle(current, game.sheetName))}
                      />
                    </td>
                    <td>{game.sheetName}</td>
                    <td>{game.playedOn}</td>
                    <td>{game.players}</td>
                    <td className="muted">
                      {game.sample
                        .map((row) => `${row.place}. ${row.playerName} — ${row.points}`)
                        .join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {preview ? (
        <section className="poker-panel">
          <div className="panel-heading">
            <div>
              <h2>Месяцы рейтинга ({preview.months.length})</h2>
              <p className="muted">
                Если в листе несколько колонок с суммами, выберите ту, что шла в зачёт,
                и нажмите «Посмотреть» ещё раз — числа пересчитаются. Листы, которые не
                удалось прочитать, перечислены ниже с причиной.
              </p>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Импорт</th>
                  <th>Лист</th>
                  <th>Месяц</th>
                  <th>Колонка очков</th>
                  <th>Игроков</th>
                  <th>Первые строки</th>
                </tr>
              </thead>
              <tbody>
                {preview.months.map((month) => (
                  <tr key={month.sheetName}>
                    <td>
                      <input
                        checked={!skip.includes(month.sheetName)}
                        type="checkbox"
                        onChange={() => setSkip((current) => toggle(current, month.sheetName))}
                      />
                    </td>
                    <td>{month.sheetName}</td>
                    <td>{month.month}</td>
                    <td>
                      {month.headers && month.headers.length > 0 ? (
                        <select
                          value={points[month.sheetName] ?? month.pointsHeading ?? ""}
                          onChange={(event) =>
                            setPoints((current) => ({
                              ...current,
                              [month.sheetName]: event.target.value,
                            }))
                          }
                        >
                          <option value="">определить самому</option>
                          {month.headers
                            .filter((header) => header.length > 0)
                            .map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{month.players}</td>
                    <td className="muted">
                      {month.sample
                        .map((row) => `${row.playerName} — ${row.points}`)
                        .join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.skippedMonths && preview.skippedMonths.length > 0 ? (
            <div className="admin-table-wrap">
              <p className="field-help">Пропущенные листы рейтинговой таблицы:</p>
              <table>
                <thead>
                  <tr>
                    <th>Лист</th>
                    <th>Почему пропущен</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.skippedMonths.map((sheet) => (
                    <tr key={sheet.sheetName}>
                      <td>{sheet.sheetName}</td>
                      <td className="muted">{sheet.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
