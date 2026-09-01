"use client";

import { useState } from "react";
import { Download, Eye, Loader2 } from "lucide-react";

type GamePreview = {
  playedOn: string;
  players: number;
  sample: Array<{ knockouts: number; place: number; playerName: string; points: number }>;
  sheetName: string;
};

type MonthPreview = {
  month: string;
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/import-history?year=${encodeURIComponent(year)}`);
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
        body: JSON.stringify({ fun, skip, year: Number(year) }),
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
                Листы, из которых не удалось прочитать таблицу, перечислены ниже с причиной.
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
