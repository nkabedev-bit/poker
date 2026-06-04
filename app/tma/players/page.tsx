"use client";

import { useCallback, useEffect, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { Users, Plus, Trash2 } from "lucide-react";

type Player = {
  id: string;
  name: string;
  table: number;
  seat: number;
  stack: number;
  status: "active" | "eliminated";
};

export default function TMAPlayersPage() {
  const { initData } = useTMA();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form State
  const [name, setName] = useState("");
  const [table, setTable] = useState("1");
  const [seat] = useState("1");

  const fetchPlayers = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/players", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players || []);
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchPlayers(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchPlayers]);

  useEffect(() => {
    const tg = getTelegramWebApp();
    if (!tg) return;

    if (showAddForm) {
      tg.MainButton.setText("ДОБАВИТЬ ИГРОКА");
      tg.MainButton.show();
      const onClick = async () => {
        if (!name) return tg.showAlert("Введите имя");
        
        tg.MainButton.showProgress();
        try {
          const res = await fetch("/api/tma/players", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Telegram-Init-Data": initData,
            },
            body: JSON.stringify({ name, table, seat }),
          });
          if (res.ok) {
            tg.HapticFeedback.notificationOccurred("success");
            setShowAddForm(false);
            setName("");
            await fetchPlayers();
          } else {
            tg.HapticFeedback.notificationOccurred("error");
          }
        } finally {
          tg.MainButton.hideProgress();
        }
      };
      tg.MainButton.onClick(onClick);
      return () => {
        tg.MainButton.offClick(onClick);
        tg.MainButton.hide();
      };
    } else {
      tg.MainButton.hide();
    }
  }, [showAddForm, name, table, seat, initData, fetchPlayers]);

  const handleDelete = async (id: string) => {
    const tg = getTelegramWebApp();
    tg?.showConfirm("Удалить игрока (если он добавлен по ошибке)?", async (confirmed: boolean) => {
      if (confirmed) {
        await fetch(`/api/tma/players/${id}`, {
          method: "DELETE",
          headers: { "X-Telegram-Init-Data": initData },
        });
        tg?.HapticFeedback.impactOccurred("medium");
        void fetchPlayers();
      }
    });
  };

  const activeCount = players.filter(p => p.status === "active").length;
  const elimCount = players.filter(p => p.status === "eliminated").length;

  if (loading) return <div>Загрузка...</div>;

  if (showAddForm) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold mb-4">Новый игрок</h2>
        <div>
          <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1">Имя</label>
          <input
            type="text"
            className="w-full bg-[var(--tg-theme-secondary-bg-color)] text-black font-semibold border-none rounded p-3 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Иван Иванов"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--tg-theme-hint-color)] mb-1">Стол</label>
          <input
            type="number"
            className="w-full bg-[var(--tg-theme-secondary-bg-color)] text-black font-semibold border-none rounded p-3 outline-none"
            value={table}
            onChange={(e) => setTable(e.target.value)}
          />
        </div>
        <button 
          onClick={() => setShowAddForm(false)}
          className="mt-4 w-full p-3 text-[var(--tg-theme-button-color)]"
        >
          Отмена
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Users size={20} /> Игроки сегодня
        </h1>
        <button 
          onClick={() => {
            setShowAddForm(true);
            getTelegramWebApp()?.HapticFeedback.impactOccurred("light");
          }}
          className="bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)] p-2 rounded-full"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex justify-between text-sm text-[var(--tg-theme-hint-color)] mb-4 bg-[var(--tg-theme-secondary-bg-color)] p-3 rounded-lg">
        <span>Активных: <strong className="text-white">{activeCount}</strong></span>
        <span>Выбыло: <strong className="text-white">{elimCount}</strong></span>
      </div>

      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between p-3 bg-[var(--tg-theme-secondary-bg-color)] rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${p.status === "active" ? "bg-green-500" : "bg-red-500"}`} />
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-[var(--tg-theme-hint-color)]">
                  {p.status === "active" ? `Ст. ${p.table} / Место ${p.seat} / Стек: ${p.stack}` : "Выбыл"}
                </div>
              </div>
            </div>
            {p.status === "active" && (
               <button onClick={() => handleDelete(p.id)} className="text-red-400 p-2">
                 <Trash2 size={16} />
               </button>
            )}
          </div>
        ))}
        {players.length === 0 && (
          <div className="text-center text-[var(--tg-theme-hint-color)] py-10">
            Нет игроков
          </div>
        )}
      </div>
    </div>
  );
}
