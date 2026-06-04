"use client";

import { useState } from "react";

const bonusOptions = [
  "🎟️ Бесплатный вход в следующий турнир",
  "🔄 Бесплатный ребай",
  "➕ Бесплатный аддон",
  "💎 Удвоенный начальный стек",
  "⏰ Поздняя регистрация +30 мин",
  "🎯 Выбор места за столом",
  "👑 VIP место за финальным столом",
  "🎫 Билет на крупный турнир",
  "🎁 Бонус +5000 фишек на старте",
  "🛡️ Иммунитет от выбывания (1 раз)",
  "⏱️ Дополнительный тайм-банк",
  "👀 Подсмотреть одну карту соперника",
  "👕 Фирменный мерч клуба",
  "🍕 Ваучер в ресторан",
  "📚 Персональная тренировка с про",
];

type PrizePlace = {
  bonuses: string[];
  place: number;
};

type PrizesEditorProps = {
  initialPlaces: PrizePlace[];
  saveAction: (formData: FormData) => void | Promise<void>;
};

export function PrizesEditor({ initialPlaces, saveAction }: PrizesEditorProps) {
  const [places, setPlaces] = useState<PrizePlace[]>(initialPlaces);

  function updatePlace(index: number, place: number) {
    setPlaces((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, place } : item,
      ),
    );
  }

  function toggleBonus(index: number, bonus: string) {
    setPlaces((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const hasBonus = item.bonuses.includes(bonus);
        return {
          ...item,
          bonuses: hasBonus
            ? item.bonuses.filter((value) => value !== bonus)
            : [...item.bonuses, bonus],
        };
      }),
    );
  }

  function addPlace() {
    setPlaces((current) => [
      ...current,
      { place: current.length + 1, bonuses: [] },
    ]);
  }

  function removePlace(index: number) {
    setPlaces((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <form action={saveAction} className="poker-panel prizes-editor">
      <input name="prizes" type="hidden" value={JSON.stringify(places)} />
      <div className="panel-heading">
        <div>
          <h2>🏆 Призы и бонусы</h2>
          <p className="muted">
            <strong>🥇 1 место:</strong> получает кубок 🏆 + выбранные бонусы
          </p>
          <p className="muted">
            <strong>🥈🥉 Остальные места:</strong> только бонусы
          </p>
        </div>
      </div>
      <div className="prize-list">
        {places.map((item, index) => (
          <div className="prize-place" key={`${item.place}-${index}`}>
            <div className="prize-place-head">
              <span>{index + 1}</span>
              <input
                aria-label="Призовое место"
                min={1}
                type="number"
                value={item.place}
                onChange={(event) => updatePlace(index, Number(event.target.value))}
              />
              <strong>{index === 0 ? "🏆 КУБОК" : "Только бонусы"}</strong>
              <button className="ghost-button" type="button" onClick={() => removePlace(index)}>
                🗑️ Удалить
              </button>
            </div>
            <p className="prize-bonus-label">Бонусы/Плюшки:</p>
            <div className="bonus-grid">
              {bonusOptions.map((bonus) => (
                <button
                  className={item.bonuses.includes(bonus) ? "gold-button" : "gold-outline-button"}
                  key={bonus}
                  type="button"
                  onClick={() => toggleBonus(index, bonus)}
                >
                  {bonus}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="green-button" type="button" onClick={addPlace}>
        + Добавить призовое место
      </button>
      <button className="gold-button" type="submit">
        💾 Сохранить призы
      </button>
    </form>
  );
}
