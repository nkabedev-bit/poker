"use client";

import { nameSeat, readTableFormats } from "@/lib/tables/seating";
import type { TournamentExtras } from "@/lib/timer/types";

export function TablesManager({ extras }: { extras: TournamentExtras }) {
  const { players, settings } = extras;
  const tables = Array.from({ length: settings.tablesCount }, (_, index) => index + 1);
  // What each table is dealt in tonight, including the chairs the desk brought over.
  const formats = readTableFormats(
    settings.maxPlayersPerTable,
    extras.tableFormats,
    settings.tablesCount,
  );

  return (
    <section className="poker-panel tables-manager">
      <div className="panel-heading">
        <div>
          <h2>🎲 Столы ({settings.tablesCount})</h2>
          <p className="muted">Формат стола по умолчанию: {settings.maxPlayersPerTable} макс</p>
        </div>
      </div>
      <div className="tables-grid">
        {tables.map((table) => {
          const tablePlayers = players.filter((player) => player.table === table);
          return (
            <div className="table-card" key={table}>
              <h3>
                Стол {table} · {formats[table - 1]} макс
              </h3>
              {tablePlayers.length === 0 ? (
                <p className="muted">Пусто</p>
              ) : (
                <ul>
                  {tablePlayers.map((player) => (
                    <li key={player.id}>
                      <span>{player.seat ? nameSeat(formats, table, player.seat) : "?"}</span>
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
