"use client";

import type { TournamentExtras } from "@/lib/timer/types";

export function TablesManager({ extras }: { extras: TournamentExtras }) {
  const { players, settings } = extras;
  const tables = Array.from({ length: settings.tablesCount }, (_, index) => index + 1);

  return (
    <section className="poker-panel tables-manager">
      <div className="panel-heading">
        <div>
          <h2>🎲 Столы ({settings.tablesCount})</h2>
          <p className="muted">Игроков за столом: {settings.maxPlayersPerTable}</p>
        </div>
      </div>
      <div className="tables-grid">
        {tables.map((table) => {
          const tablePlayers = players.filter((player) => player.table === table);
          return (
            <div className="table-card" key={table}>
              <h3>Стол {table}</h3>
              {tablePlayers.length === 0 ? (
                <p className="muted">Пусто</p>
              ) : (
                <ul>
                  {tablePlayers.map((player) => (
                    <li key={player.id}>
                      <span>{player.seat ?? "?"}</span>
                      {player.name || "Без имени"}
                      <strong>{player.stack.toLocaleString("ru-RU")}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
