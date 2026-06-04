"use client";

import { useRef, useState } from "react";

type AdminHeaderActionsProps = {
  publicUrl: string;
  stateUrl: string;
  resetAction: () => Promise<void>;
};

export function AdminHeaderActions({
  publicUrl,
  resetAction,
  stateUrl,
}: AdminHeaderActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function exportTournament() {
    setMessage(null);
    const response = await fetch("/api/admin/export", { cache: "no-store" });

    if (!response.ok) {
      setMessage("Экспорт не удался");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `poker-tournament-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importTournament(file: File) {
    setMessage(null);

    try {
      const payload = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setMessage("Импорт не удался");
        return;
      }

      setMessage("Импорт готов");
      window.location.reload();
    } catch {
      setMessage("Файл не похож на экспорт турнира");
    }
  }

  return (
    <div className="admin-actions">
      <button className="green-button" type="button" onClick={exportTournament}>
        📥 Экспорт
      </button>
      <button
        className="gold-button"
        type="button"
        onClick={() => fileInputRef.current?.click()}
      >
        📤 Импорт
      </button>
      <input
        ref={fileInputRef}
        accept="application/json"
        className="admin-import-input"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) void importTournament(file);
        }}
      />
      <a className="gold-outline-button" href={publicUrl} target="_blank">
        📺 Экран для игроков
      </a>
      <a className="gold-outline-button" href={stateUrl} target="_blank">
        🏆 Состояние турнира
      </a>
      <form
        action={resetAction}
        onSubmit={(event) => {
          if (!window.confirm("Сбросить турнир к начальному состоянию?")) {
            event.preventDefault();
          }
        }}
      >
        <button className="red-button" type="submit">
          🔄 Сбросить
        </button>
      </form>
      {message ? <span className="admin-action-message">{message}</span> : null}
    </div>
  );
}
