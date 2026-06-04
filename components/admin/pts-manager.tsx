"use client";

import { useMemo, useRef, useState } from "react";
import { BookmarkPlus, RefreshCw, Save } from "lucide-react";
import {
  refreshLeaderboard,
  savePtsSettings,
  savePtsTemplate,
} from "@/app/admin/extras/actions";
import {
  buildPtsStandingsRows,
  normalizePlacePoints,
} from "@/lib/pts-rating";
import type { TournamentExtras } from "@/lib/timer/types";

export function PtsManager({ extras }: { extras: TournamentExtras }) {
  const placeTemplates = extras.pts.placeTemplates;
  const bountyTemplates = extras.pts.bountyTemplates;
  const [placePoints, setPlacePoints] = useState(() =>
    normalizePlacePoints(extras.pts.placePoints).map(formatNumberInput),
  );
  const [bountyPoints, setBountyPoints] = useState(() => formatNumberInput(extras.pts.bountyPoints));
  const [templateDialog, setTemplateDialog] = useState<"places" | "bounty" | null>(null);
  const [templateName, setTemplateName] = useState("");
  const templateNameRef = useRef<HTMLInputElement>(null);
  const templateKindRef = useRef<HTMLInputElement>(null);
  const templateSubmitRef = useRef<HTMLButtonElement>(null);

  const placeTemplatesJson = useMemo(() => JSON.stringify(placeTemplates), [placeTemplates]);
  const bountyTemplatesJson = useMemo(() => JSON.stringify(bountyTemplates), [bountyTemplates]);

  function updatePlace(index: number, value: string) {
    const next = [...placePoints];
    next[index] = value;
    setPlacePoints(next);
  }

  function applyPlaceTemplate(templateId: string) {
    const template = placeTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setPlacePoints(normalizePlacePoints(template.placePoints).map(formatNumberInput));
  }

  function applyBountyTemplate(templateId: string) {
    const template = bountyTemplates.find((item) => item.id === templateId);
    if (!template) return;

    setBountyPoints(formatNumberInput(template.bountyPoints));
  }

  function saveTemplate(kind: "places" | "bounty") {
    setTemplateName("");
    setTemplateDialog(kind);
  }

  function submitTemplate() {
    const name = templateName.trim();
    if (!name) return;

    if (templateNameRef.current) templateNameRef.current.value = name;
    if (templateKindRef.current) templateKindRef.current.value = templateDialog ?? "places";
    templateSubmitRef.current?.click();
  }

  return (
    <div className="settings-stack">
      <form action={savePtsSettings} className="poker-panel pts-panel">
        <div className="panel-heading">
          <div>
            <h2>PTS рейтинг</h2>
            <p className="muted">Очки за места, баунти и шаблоны турниров.</p>
          </div>
        </div>

        <input name="placeTemplates" type="hidden" value={placeTemplatesJson} />
        <input name="bountyTemplates" type="hidden" value={bountyTemplatesJson} />
        <input ref={templateNameRef} name="templateName" type="hidden" />
        <input ref={templateKindRef} name="templateKind" type="hidden" defaultValue="places" />
        <button
          ref={templateSubmitRef}
          hidden
          formAction={savePtsTemplate}
          type="submit"
        />

        <div className="pts-template-row">
          <label>
            Шаблон мест
            <select defaultValue="" onChange={(event) => applyPlaceTemplate(event.target.value)}>
              <option value="" disabled>
                Выбрать шаблон мест
              </option>
              {placeTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Шаблон баунти
            <select defaultValue="" onChange={(event) => applyBountyTemplate(event.target.value)}>
              <option value="" disabled>
                Выбрать шаблон баунти
              </option>
              {bountyTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pts-bounty-row">
          <strong>Баунти</strong>
          <label>
            Кол-во очков за баунти
            <input
              name="bountyPoints"
              inputMode="decimal"
              pattern="-?[0-9]*[.,]?[0-9]*"
              type="text"
              value={bountyPoints}
              onChange={(event) => setBountyPoints(event.target.value)}
            />
          </label>
          <button
            className="ghost-button"
            type="button"
            onClick={() => saveTemplate("bounty")}
          >
            <BookmarkPlus size={16} /> Сохранить шаблон
          </button>
        </div>

        <div className="admin-table-wrap">
          <table className="pts-table">
            <thead>
              <tr>
                <th>Место</th>
                <th>Кол-во очков за место</th>
              </tr>
            </thead>
            <tbody>
              {placePoints.map((points, index) => (
                <tr key={index + 1}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      aria-label={`Очки за ${index + 1} место`}
                      inputMode="decimal"
                      name={`place_${index + 1}`}
                      pattern="-?[0-9]*[.,]?[0-9]*"
                      type="text"
                      value={points}
                      onChange={(event) => updatePlace(index, event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="button-row">
          <button className="gold-button" type="submit">
            <Save size={16} /> Сохранить
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => saveTemplate("places")}
          >
            <BookmarkPlus size={16} /> Сохранить шаблон
          </button>
        </div>

        {templateDialog ? (
          <div className="pts-dialog-backdrop" role="dialog" aria-modal="true">
            <div className="pts-dialog">
              <h3>Укажите название шаблона</h3>
              <input
                autoFocus
                placeholder="Название шаблона"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
              />
              <div className="button-row">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setTemplateDialog(null)}
                >
                  Отмена
                </button>
                <button className="gold-button" type="button" onClick={submitTemplate}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </form>

      <LeaderboardTables extras={extras} />
    </div>
  );
}

function formatNumberInput(value: number) {
  return Number.isFinite(value) ? String(value) : "";
}

export function LeaderboardTables({ extras }: { extras: TournamentExtras }) {
  const rows = buildPtsStandingsRows(extras.players, extras.pts);

  return (
    <section className="poker-panel leaderboard-panel">
      <div className="panel-heading">
        <h2>Текущие PTS результаты</h2>
        <form action={refreshLeaderboard}>
          <button className="ghost-button" type="submit">
            <RefreshCw size={16} /> Обновить
          </button>
        </form>
      </div>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Место</th>
              <th>Игрок</th>
              <th>Очки</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.place}>
                <td>{row.place}</td>
                <td>{row.playerName || "—"}</td>
                <td>{row.points ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {extras.players.length === 0 ? <p className="muted">Игроков пока нет.</p> : null}
    </section>
  );
}
