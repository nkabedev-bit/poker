"use client";

import { useMemo, useState } from "react";
import type { BlindLevel } from "@/lib/timer/types";

type BlindsEditorProps = {
  levels: BlindLevel[];
  applyPreset: (formData: FormData) => void | Promise<void>;
  saveLevels: (formData: FormData) => void | Promise<void>;
};

function emptyLevel(levelOrder: number): BlindLevel {
  return {
    id: crypto.randomUUID(),
    levelOrder,
    smallBlind: 100,
    bigBlind: 200,
    ante: null,
    durationSeconds: 1200,
    isBreak: false,
    breakDurationSeconds: null,
  };
}

export function BlindsEditor({ levels, applyPreset, saveLevels }: BlindsEditorProps) {
  const [rows, setRows] = useState<BlindLevel[]>(levels);
  const serialized = useMemo(() => JSON.stringify(rows), [rows]);

  function updateRow(index: number, patch: Partial<BlindLevel>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  }

  function addLevel() {
    setRows((current) => [...current, emptyLevel(current.length + 1)]);
  }

  function removeLevel(index: number) {
    setRows((current) =>
      current
        .filter((_, rowIndex) => rowIndex !== index)
        .map((row, rowIndex) => ({ ...row, levelOrder: rowIndex + 1 })),
    );
  }

  return (
    <div className="poker-panel blinds-editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Структура блайндов</p>
          <h2>Уровни турнира</h2>
        </div>
        <div className="preset-row">
          {[
            ["turbo", "Турбо"],
            ["standard", "Стандарт"],
            ["deep", "Глубокий стек"],
          ].map(([preset, label]) => (
            <form action={applyPreset} key={preset}>
              <input name="preset" type="hidden" value={preset} />
              <button className="gold-outline-button" type="submit">
                {label}
              </button>
            </form>
          ))}
        </div>
      </div>
      <form action={saveLevels} className="levels-form">
        <input name="levels" type="hidden" value={serialized} />
        <div className="levels-grid levels-header">
          <span>#</span>
          <span>SB</span>
          <span>BB</span>
          <span>Ante</span>
          <span>Мин</span>
          <span>Перерыв</span>
          <span />
        </div>
        {rows.map((row, index) => (
          <div className="levels-grid" key={row.id}>
            <input
              aria-label="Порядок уровня"
              min={1}
              type="number"
              value={row.levelOrder}
              onChange={(event) =>
                updateRow(index, { levelOrder: Number(event.target.value) })
              }
            />
            <input
              aria-label="Малый блайнд"
              disabled={row.isBreak}
              min={1}
              type="number"
              value={row.smallBlind ?? ""}
              onChange={(event) =>
                updateRow(index, { smallBlind: Number(event.target.value) || null })
              }
            />
            <input
              aria-label="Большой блайнд"
              disabled={row.isBreak}
              min={1}
              type="number"
              value={row.bigBlind ?? ""}
              onChange={(event) =>
                updateRow(index, { bigBlind: Number(event.target.value) || null })
              }
            />
            <input
              aria-label="Ante"
              disabled={row.isBreak}
              min={0}
              type="number"
              value={row.ante ?? ""}
              onChange={(event) =>
                updateRow(index, { ante: Number(event.target.value) || null })
              }
            />
            <input
              aria-label="Длительность уровня"
              min={1}
              type="number"
              value={Math.round(row.durationSeconds / 60)}
              onChange={(event) =>
                updateRow(index, {
                  durationSeconds: Number(event.target.value) * 60,
                  breakDurationSeconds: row.isBreak
                    ? Number(event.target.value) * 60
                    : row.breakDurationSeconds,
                })
              }
            />
            <input
              aria-label="Это перерыв"
              checked={row.isBreak}
              type="checkbox"
              onChange={(event) =>
                updateRow(index, {
                  isBreak: event.target.checked,
                  breakDurationSeconds: event.target.checked
                    ? row.durationSeconds
                    : null,
                })
              }
            />
            <button className="ghost-button" type="button" onClick={() => removeLevel(index)}>
              Удалить
            </button>
          </div>
        ))}
        <div className="button-row">
          <button className="green-button" type="button" onClick={addLevel}>
            + Уровень
          </button>
          <button className="gold-button" type="submit">
            Сохранить структуру
          </button>
        </div>
      </form>
    </div>
  );
}
