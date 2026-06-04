"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { blindPresets, type BlindPresetName } from "@/lib/timer/presets";
import type {
  BlindLevel,
  BlindTemplate,
  BlindTemplateLevel,
} from "@/lib/timer/types";

type BlindsEditorProps = {
  blindTemplates: BlindTemplate[];
  levels: BlindLevel[];
  reentryEnabled?: boolean;
  returnTo?: string;
  saveBlindTemplate: (formData: FormData) => void | Promise<void>;
  saveLevels: (formData: FormData) => void | Promise<void>;
};

const presetButtons: Array<[BlindPresetName, string]> = [
  ["turbo", "⚡ Турбо"],
  ["standard", "🃏 Стандарт"],
  ["deep", "🐢 Глубокий"],
];

function makeLevelFromTemplate(
  level: BlindTemplateLevel,
  index: number,
): BlindLevel {
  return {
    id: crypto.randomUUID(),
    levelOrder: index + 1,
    smallBlind: level.smallBlind,
    bigBlind: level.bigBlind,
    ante: level.isBreak ? null : 0,
    reentryCloses: level.isBreak ? false : Boolean(level.reentryCloses),
    durationSeconds: level.durationSeconds,
    isBreak: level.isBreak,
    breakDurationSeconds: level.breakDurationSeconds,
  };
}

function makeBlindLevel(levelOrder: number, prev?: BlindLevel): BlindLevel {
  const smallBlind = prev && !prev.isBreak && prev.smallBlind
    ? prev.smallBlind * 2
    : 100;
  const bigBlind = prev && !prev.isBreak && prev.bigBlind
    ? prev.bigBlind * 2
    : 200;
  return {
    id: crypto.randomUUID(),
    levelOrder,
    smallBlind,
    bigBlind,
    ante: 0,
    reentryCloses: false,
    durationSeconds: prev?.durationSeconds ?? 1200,
    isBreak: false,
    breakDurationSeconds: null,
  };
}

function makeBreakLevel(levelOrder: number): BlindLevel {
  return {
    id: crypto.randomUUID(),
    levelOrder,
    smallBlind: null,
    bigBlind: null,
    ante: null,
    reentryCloses: false,
    durationSeconds: 600,
    isBreak: true,
    breakDurationSeconds: 600,
  };
}

function parsePositiveOrNull(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function BlindsEditor({
  blindTemplates,
  levels,
  reentryEnabled = true,
  returnTo = "/admin/blinds",
  saveBlindTemplate,
  saveLevels,
}: BlindsEditorProps) {
  const [rows, setRows] = useState<BlindLevel[]>(levels);
  const templateFormRef = useRef<HTMLFormElement>(null);
  const templateNameRef = useRef<HTMLInputElement>(null);
  const serialized = useMemo(
    () => JSON.stringify(
      reentryEnabled ? rows : rows.map((row) => ({ ...row, reentryCloses: false })),
    ),
    [reentryEnabled, rows],
  );

  function preventInputSubmit(event: KeyboardEvent<HTMLFormElement>) {
    if (
      event.key === "Enter" &&
      event.target instanceof HTMLInputElement
    ) {
      event.preventDefault();
    }
  }

  function updateRow(index: number, patch: Partial<BlindLevel>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function addLevel() {
    setRows((current) => {
      const prev = current[current.length - 1];
      return [...current, makeBlindLevel(current.length + 1, prev)];
    });
  }

  function addBreak() {
    setRows((current) => {
      return [...current, makeBreakLevel(current.length + 1)];
    });
  }

  function removeLevel(index: number) {
    setRows((current) =>
      current
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({ ...row, levelOrder: rowIndex + 1 })),
    );
  }

  function toggleReentryCutoff(index: number, checked: boolean) {
    setRows((current) =>
      current.map((row, rowIndex) => ({
        ...row,
        reentryCloses: checked && rowIndex === index && !row.isBreak,
      })),
    );
  }

  function applyPreset(preset: BlindPresetName) {
    setRows(blindPresets[preset].map(makeLevelFromTemplate));
  }

  function applyTemplate(templateId: string) {
    const template = blindTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setRows(template.levels.map(makeLevelFromTemplate));
  }

  function promptAndSaveTemplate() {
    const templateName = window.prompt("Название шаблона блайндов");
    const cleaned = templateName?.trim();
    if (!cleaned || !templateNameRef.current) return;

    templateNameRef.current.value = cleaned;
    templateFormRef.current?.requestSubmit();
  }

  // Compute display level numbers (skip breaks in level count)
  const levelNumbers: number[] = [];
  let levelCount = 0;
  for (const row of rows) {
    if (row.isBreak) {
      levelNumbers.push(0);
    } else {
      levelCount++;
      levelNumbers.push(levelCount);
    }
  }

  return (
    <div className="poker-panel blinds-editor-v2">
      {/* Header with presets */}
      <div className="be2-header">
        <div>
          <h2 className="be2-title">🃏 Структура блайндов</h2>
          <p className="be2-preset-label">Готовые шаблоны:</p>
        </div>
        <div className="be2-preset-row">
          {presetButtons.map(([preset, label]) => (
            <button
              className="be2-preset-btn"
              key={preset}
              type="button"
              onClick={() => applyPreset(preset)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="be2-template-row">
        <label className="be2-template-field">
          <span>Выбор шаблона</span>
          <select
            aria-label="Выбор шаблона блайндов"
            defaultValue=""
            onChange={(event) => applyTemplate(event.target.value)}
          >
            <option value="">Выберите шаблон</option>
            {blindTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="be2-template-save-btn"
          type="button"
          onClick={promptAndSaveTemplate}
        >
          💾 Сохранить шаблон блайндов
        </button>
      </div>

      <form action={saveBlindTemplate} className="sr-only" ref={templateFormRef}>
        <input name="returnTo" type="hidden" value={returnTo} />
        <input name="levels" type="hidden" value={serialized} />
        <input name="templateName" ref={templateNameRef} type="hidden" />
      </form>

      <form action={saveLevels} className="be2-form" onKeyDown={preventInputSubmit}>
        <input name="levels" type="hidden" value={serialized} />
        <input name="returnTo" type="hidden" value={returnTo} />

        {/* Column headers */}
        <div className={`be2-col-headers${reentryEnabled ? "" : " be2-col-headers--no-reentry"}`}>
          <span></span>
          <span>SB</span>
          <span>BB</span>
          {reentryEnabled ? <span>Конец ре-энтри</span> : null}
          <span>Время</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="be2-rows">
          {rows.map((row, index) => (
            <div
              className={`be2-row${row.isBreak ? " be2-row--break" : ""}${!row.isBreak && !reentryEnabled ? " be2-row--no-reentry" : ""}`}
              key={row.id}
            >
              {/* Level badge */}
              <div className="be2-level-badge">
                {row.isBreak ? (
                  <span className="be2-break-badge">☕</span>
                ) : (
                  <span className="be2-num-badge">{levelNumbers[index]}</span>
                )}
              </div>

              {row.isBreak ? (
                /* Break row */
                <>
                  <div className="be2-break-label">Перерыв</div>
                  <div className="be2-break-duration be2-duration-field">
                    <span className="be2-mobile-label">Минуты</span>
                    <div className="be2-duration-input">
                      <input
                        aria-label="Длительность перерыва"
                        className="be2-input"
                        inputMode="numeric"
                        min={1}
                        pattern="[0-9]*"
                        type="number"
                        value={Math.round(row.durationSeconds / 60) || ""}
                        onChange={(e) => {
                          const mins = parsePositiveOrNull(e.target.value);
                          if (mins) {
                            updateRow(index, {
                              durationSeconds: mins * 60,
                              breakDurationSeconds: mins * 60,
                            });
                          }
                        }}
                      />
                      <span className="muted">мин</span>
                    </div>
                  </div>
                </>
              ) : (
                /* Normal level row */
                <>
                  <label className="be2-field be2-field--sb">
                    <span className="be2-mobile-label">SB</span>
                    <input
                      aria-label="Малый блайнд"
                      className="be2-input"
                      inputMode="numeric"
                      min={1}
                      pattern="[0-9]*"
                      type="number"
                      value={row.smallBlind ?? ""}
                      onChange={(e) =>
                        updateRow(index, { smallBlind: parsePositiveOrNull(e.target.value) })
                      }
                    />
                  </label>
                  <label className="be2-field be2-field--bb">
                    <span className="be2-mobile-label">BB</span>
                    <input
                      aria-label="Большой блайнд"
                      className="be2-input"
                      inputMode="numeric"
                      min={1}
                      pattern="[0-9]*"
                      type="number"
                      value={row.bigBlind ?? ""}
                      onChange={(e) =>
                        updateRow(index, { bigBlind: parsePositiveOrNull(e.target.value) })
                      }
                    />
                  </label>
                  {reentryEnabled ? (
                    <label className="be2-field be2-field--reentry">
                      <span className="be2-mobile-label">Конец ре-энтри</span>
                      <input
                        aria-label="Конец ре-энтри"
                        checked={Boolean(row.reentryCloses)}
                        className="be2-reentry-checkbox"
                        type="checkbox"
                        onChange={(e) => toggleReentryCutoff(index, e.target.checked)}
                      />
                      <span className="be2-reentry-text">Конец ре-энтри</span>
                    </label>
                  ) : null}
                  <div className="be2-duration-field">
                    <span className="be2-mobile-label">Минуты</span>
                    <div className="be2-duration-input">
                      <input
                        aria-label="Длительность уровня"
                        className="be2-input"
                        inputMode="numeric"
                        min={1}
                        pattern="[0-9]*"
                        type="number"
                        value={Math.round(row.durationSeconds / 60) || ""}
                        onChange={(e) => {
                          const mins = parsePositiveOrNull(e.target.value);
                          if (mins) {
                            updateRow(index, { durationSeconds: mins * 60 });
                          }
                        }}
                      />
                      <span className="muted">мин</span>
                    </div>
                  </div>
                </>
              )}

              {/* Delete */}
              <button
                aria-label="Удалить уровень"
                className="be2-delete-btn"
                type="button"
                onClick={() => removeLevel(index)}
              >
                🗑
              </button>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="be2-actions">
          <button className="be2-add-btn" type="button" onClick={addLevel}>
            + Уровень
          </button>
          <button className="be2-break-btn" type="button" onClick={addBreak}>
            + Перерыв
          </button>
          <button className="be2-save-btn" type="submit">
            💾 Сохранить
          </button>
        </div>
      </form>
    </div>
  );
}
