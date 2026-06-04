"use client";

import { useMemo, useState } from "react";
import type { TournamentExtras, TournamentPlayer } from "@/lib/timer/types";

type PlayersManagerProps = {
  extras: TournamentExtras;
  saveAction: (formData: FormData) => void | Promise<void>;
  startingStack: number;
};

function newPlayer(startingStack: number): TournamentPlayer {
  return {
    addons: 0,
    bountyCount: 0,
    finishPlace: null,
    id: crypto.randomUUID(),
    name: "",
    rebuys: 0,
    seat: null,
    stack: startingStack,
    status: "active",
    table: null,
  };
}

export function PlayersManager({ extras, saveAction, startingStack }: PlayersManagerProps) {
  const [players, setPlayers] = useState<TournamentPlayer[]>(extras.players);
  const activeCount = useMemo(
    () => players.filter((player) => player.status === "active").length,
    [players],
  );

  function updatePlayer(index: number, patch: Partial<TournamentPlayer>) {
    setPlayers((current) =>
      current.map((player, playerIndex) =>
        playerIndex === index ? { ...player, ...patch } : player,
      ),
    );
  }

  function addPlayer() {
    setPlayers((current) => [
      ...current,
      newPlayer(startingStack),
    ]);
  }

  function removePlayer(index: number) {
    setPlayers((current) => current.filter((_, playerIndex) => playerIndex !== index));
  }

  return (
    <form action={saveAction} className="poker-panel players-manager">
      <input name="players" type="hidden" value={JSON.stringify(players)} />
      <div className="panel-heading">
        <div>
          <h2>👥 Игроки ({players.length})</h2>
          <p className="muted">
            Активных: {activeCount} · Выбыли: {players.length - activeCount}
          </p>
        </div>
        <button className="green-button" type="button" onClick={addPlayer}>
          + Добавить игрока
        </button>
      </div>
      <div className="players-grid players-header">
        <span>Имя</span>
        <span>Стек</span>
        <span>Стол</span>
        <span>Место</span>
        <span>Ребаи</span>
        <span>Аддоны</span>
        <span>Баунти</span>
        <span>Статус</span>
        <span />
      </div>
      {players.length === 0 ? (
        <p className="muted">Игроков пока нет. Добавьте игрока и нажмите сохранить.</p>
      ) : (
        players.map((player, index) => (
          <div className="players-grid" key={player.id}>
            <input
              aria-label="Имя игрока"
              placeholder="Имя"
              value={player.name}
              onChange={(event) => updatePlayer(index, { name: event.target.value })}
            />
            <input
              aria-label="Стек игрока"
              min={0}
              type="number"
              value={player.stack}
              onChange={(event) => updatePlayer(index, { stack: Number(event.target.value) })}
            />
            <input
              aria-label="Стол игрока"
              min={1}
              type="number"
              value={player.table ?? ""}
              onChange={(event) =>
                updatePlayer(index, { table: event.target.value ? Number(event.target.value) : null })
              }
            />
            <input
              aria-label="Место игрока"
              min={1}
              type="number"
              value={player.seat ?? ""}
              onChange={(event) =>
                updatePlayer(index, { seat: event.target.value ? Number(event.target.value) : null })
              }
            />
            <input
              aria-label="Ребаи игрока"
              min={0}
              type="number"
              value={player.rebuys}
              onChange={(event) => updatePlayer(index, { rebuys: Number(event.target.value) })}
            />
            <input
              aria-label="Аддоны игрока"
              min={0}
              type="number"
              value={player.addons}
              onChange={(event) => updatePlayer(index, { addons: Number(event.target.value) })}
            />
            <input
              aria-label="Баунти игрока"
              min={0}
              step={0.01}
              type="number"
              value={player.bountyCount}
              onChange={(event) => updatePlayer(index, { bountyCount: Number(event.target.value) })}
            />
            <select
              aria-label="Статус игрока"
              value={player.status}
              onChange={(event) =>
                updatePlayer(index, { status: event.target.value as TournamentPlayer["status"] })
              }
            >
              <option value="active">Активен</option>
              <option value="eliminated">Выбыл</option>
            </select>
            <button className="ghost-button" type="button" onClick={() => removePlayer(index)}>
              🗑️
            </button>
          </div>
        ))
      )}
      <div className="button-row">
        <button className="gold-button" type="submit">
          💾 Сохранить игроков
        </button>
      </div>
    </form>
  );
}
