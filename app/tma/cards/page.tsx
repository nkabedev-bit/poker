"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, QrCode, RotateCcw, Search, Ticket, UserPlus } from "lucide-react";
import { getTelegramWebApp, useTMA } from "../layout";
import { isVipRegistrationNumber } from "@/lib/player-registration-number";
import type { CardSession, TicketType } from "@/lib/cards/card-code";

type Player = {
  cardCode?: string | null;
  id: string;
  name: string;
  registrationNumber?: number | null;
  status: "active" | "eliminated";
  table?: number | null;
};

const TICKET_LABELS: Record<TicketType, string> = {
  regular: "Обычный билет",
  vip: "VIP билет",
};

export default function TMACardsPage() {
  const { initData } = useTMA();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<CardSession | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ticketType, setTicketType] = useState<TicketType>("regular");

  const loadPlayers = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/players", {
        headers: { "X-Telegram-Init-Data": initData },
      });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPlayers(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPlayers]);

  const readCard = useCallback(
    async (code: string) => {
      const tg = getTelegramWebApp();
      setBusy(true);
      try {
        const res = await fetch(`/api/tma/cards?code=${encodeURIComponent(code)}`, {
          headers: { "X-Telegram-Init-Data": initData },
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          tg?.showAlert(data?.error ?? "Не удалось прочитать карту");
          return;
        }

        setScannedCode(code);
        setSession(data.session);
        tg?.HapticFeedback.notificationOccurred(data.session ? "success" : "warning");
      } finally {
        setBusy(false);
      }
    },
    [initData],
  );

  const scan = () => {
    const tg = getTelegramWebApp();

    if (!tg?.showScanQrPopup) {
      // Outside Telegram (or on an old client) there is no camera to open, so the code
      // is typed in by hand rather than the screen becoming useless.
      const typed = globalThis.prompt?.("Код карты");
      if (typed) void readCard(typed.trim());
      return;
    }

    tg.showScanQrPopup({ text: "Наведите на QR-код карты" }, (text: string) => {
      const code = text.trim();
      if (!code) return false;

      tg.closeScanQrPopup?.();
      void readCard(code);
      return true;
    });
  };

  const assign = async (player: Player) => {
    const tg = getTelegramWebApp();
    if (!scannedCode || busy) return;

    setBusy(true);
    try {
      const res = await fetch("/api/tma/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        body: JSON.stringify({ cardCode: scannedCode, playerId: player.id, ticketType }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        tg?.HapticFeedback.notificationOccurred("error");
        tg?.showAlert(data?.error ?? "Не удалось выдать карту");
        return;
      }

      tg?.HapticFeedback.notificationOccurred("success");
      setSession(data.session);
      setSearch("");
      await loadPlayers();
    } finally {
      setBusy(false);
    }
  };

  const release = () => {
    const tg = getTelegramWebApp();
    if (!scannedCode || !session) return;

    tg?.showConfirm(`Принять карту у игрока ${session.name}?`, async (confirmed: boolean) => {
      if (!confirmed) return;

      setBusy(true);
      try {
        const res = await fetch(`/api/tma/cards?code=${encodeURIComponent(scannedCode)}`, {
          method: "DELETE",
          headers: { "X-Telegram-Init-Data": initData },
        });

        if (res.ok) {
          tg?.HapticFeedback.notificationOccurred("success");
          setSession(null);
          setScannedCode(null);
          await loadPlayers();
          return;
        }

        const data = await res.json().catch(() => null);
        tg?.showAlert(data?.error ?? "Не удалось принять карту");
      } finally {
        setBusy(false);
      }
    });
  };

  if (loading) return <div>Загрузка...</div>;

  const withoutCard = players
    .filter((player) => player.status === "active" && !player.cardCode)
    .filter((player) => player.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <CreditCard size={20} /> Карты
      </h1>

      <button
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-button-color)] px-4 py-4 font-semibold text-[var(--tg-theme-button-text-color)] disabled:opacity-60"
        disabled={busy}
        type="button"
        onClick={scan}
      >
        <QrCode size={20} /> Сканировать карту
      </button>

      {scannedCode ? (
        <p className="text-center text-xs text-[var(--tg-theme-hint-color)]">
          Карта {scannedCode}
        </p>
      ) : (
        <p className="text-center text-sm text-[var(--tg-theme-hint-color)]">
          Отсканируйте карту, чтобы выдать её игроку или принять обратно.
        </p>
      )}

      {session ? (
        <div className="space-y-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] p-4">
          <div>
            <p className="text-lg font-bold">{session.name}</p>
            <p className="text-sm text-[var(--tg-theme-hint-color)]">
              {session.registrationNumber ? `#${session.registrationNumber}` : "без номера"}
              {session.table ? ` · стол ${session.table}` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-[var(--tg-theme-bg-color)] p-3">
            <Ticket className="text-[var(--tg-theme-button-color)]" size={18} />
            <span className="font-semibold">{TICKET_LABELS[session.ticketType]}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <Counter label="Ре-энтри" value={session.reentries} />
            <Counter label="Двойных" value={session.doubleReentries} />
            <Counter label="Аддонов" value={session.addons} />
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--tg-theme-bg-color)] p-3 font-semibold disabled:opacity-60"
            disabled={busy}
            type="button"
            onClick={release}
          >
            <RotateCcw size={16} /> Принять карту обратно
          </button>
        </div>
      ) : null}

      {scannedCode && !session ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Карта свободна — кому выдать?</p>

          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TICKET_LABELS) as TicketType[]).map((type) => (
              <button
                key={type}
                className={`rounded-lg p-3 text-sm font-semibold ${
                  ticketType === type
                    ? "bg-[var(--tg-theme-button-color)] text-[var(--tg-theme-button-text-color)]"
                    : "bg-[var(--tg-theme-secondary-bg-color)]"
                }`}
                type="button"
                onClick={() => setTicketType(type)}
              >
                {TICKET_LABELS[type]}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-3 text-[var(--tg-theme-hint-color)]"
              size={18}
            />
            <input
              className="w-full rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-3 pl-10 outline-none"
              placeholder="Поиск игрока"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            {withoutCard.map((player) => (
              <button
                key={player.id}
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--tg-theme-secondary-bg-color)] p-4 text-left disabled:opacity-60"
                disabled={busy}
                type="button"
                onClick={() => {
                  // A VIP registration number means a VIP seat, so the ticket is
                  // pre-picked to match and the admin only overrides the exception.
                  setTicketType(isVipRegistrationNumber(player.registrationNumber) ? "vip" : "regular");
                  void assign(player);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{player.name}</span>
                  <span className="block text-xs text-[var(--tg-theme-hint-color)]">
                    {player.registrationNumber ? `#${player.registrationNumber}` : "без номера"}
                    {player.table ? ` · стол ${player.table}` : ""}
                  </span>
                </span>
                <UserPlus className="shrink-0 text-[var(--tg-theme-button-color)]" size={18} />
              </button>
            ))}

            {withoutCard.length === 0 ? (
              <p className="py-6 text-center text-gray-500">
                {search ? "Никого не нашли" : "У всех активных игроков уже есть карты"}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--tg-theme-bg-color)] p-3">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] text-[var(--tg-theme-hint-color)]">{label}</p>
    </div>
  );
}
