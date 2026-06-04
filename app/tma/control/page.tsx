"use client";

import { useCallback, useEffect, useState } from "react";
import { getTelegramWebApp, useTMA } from "../layout";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import type { TimerState } from "@/lib/timer/types";

const CONFIRM_MESSAGE = "Вы уверены?";

export default function TMAControlPage() {
  const { initData } = useTMA();
  const [state, setState] = useState<{ timerState: TimerState } | null>(null);

  const fetchState = useCallback(async () => {
    const res = await fetch("/api/tma/timer?scope=control", { headers: { "X-Telegram-Init-Data": initData } });
    if (res.ok) {
      const data = await res.json();
      setState(data);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchState(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchState]);

  const confirmAction = () => {
    const tg = getTelegramWebApp();
    if (tg?.showConfirm) {
      return new Promise<boolean>((resolve) => tg.showConfirm(CONFIRM_MESSAGE, resolve));
    }

    return Promise.resolve(window.confirm(CONFIRM_MESSAGE));
  };

  const handleAction = async (action: string, confirm = false) => {
    if (confirm && !(await confirmAction())) return;

    const tg = getTelegramWebApp();
    tg?.HapticFeedback.impactOccurred("medium");
    await fetch(`/api/tma/timer/${action}`, {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData },
    });
    void fetchState();
  };

  if (!state) return <div>Загрузка...</div>;

  const timerStatus = state.timerState.status;
  const tournamentActive = timerStatus === "running" || timerStatus === "paused" || timerStatus === "break";

  return (
    <div className="space-y-6">
      <div className="bg-[var(--tg-theme-secondary-bg-color)] rounded-xl p-6 text-center">
        <h2 className="text-[var(--tg-theme-hint-color)] text-sm mb-4 font-semibold tracking-wider">УПРАВЛЕНИЕ</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {tournamentActive ? (
            <button
              onClick={() => handleAction("finish", true)}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-red-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Square size={18} /> Завершить турнир
            </button>
          ) : (
            <button
              onClick={() => handleAction("start", true)}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-green-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Play size={18} /> Начать турнир
            </button>
          )}
          {timerStatus === "paused" ? (
            <button
              onClick={() => handleAction("start")}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-green-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Play size={18} /> Воспроизведение
            </button>
          ) : (
            <button
              onClick={() => handleAction("pause")}
              className="min-w-[calc(50%-0.375rem)] flex-1 bg-yellow-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Pause size={18} /> Пауза
            </button>
          )}
          <button
            onClick={() => handleAction("previous", true)}
            className="min-w-[calc(50%-0.375rem)] flex-1 bg-[var(--tg-theme-button-color)] text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <SkipBack size={18} /> Предыдущий блайнд
          </button>
          <button
            onClick={() => handleAction("next", true)}
            className="min-w-[calc(50%-0.375rem)] flex-1 bg-[var(--tg-theme-button-color)] text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <SkipForward size={18} /> Следующий блайнд
          </button>
        </div>
      </div>
    </div>
  );
}
