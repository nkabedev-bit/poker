"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Wallet } from "lucide-react";
import { ScreenHeader, SectionLabel } from "../../ui";
import { getTelegramWebApp, useTMA } from "../../layout";
import { CashTabs } from "../../cash-tabs";
import { formatGameDay, formatRubles } from "@/lib/debts/ledger";
import { formatEventTimeLabel } from "@/lib/events/types";

type DebtGame = {
  amount: number;
  gameStartedAt: string;
  id: string;
  left: number;
  source: "app" | "import";
};

type DebtPaymentEntry = {
  amount: number;
  cancelledAt: string | null;
  createdAt: string;
  id: string;
  kind: "payment" | "writeoff";
  recordedBy: string | null;
};

type Debtor = {
  accountId: string | null;
  allowedUntil: string | null;
  debtorKey: string;
  games: DebtGame[];
  owed: number;
  payments: DebtPaymentEntry[];
  playerName: string;
};

type View = "games" | "players";

function askToConfirm(question: string) {
  const tg = getTelegramWebApp();
  if (!tg?.showConfirm) return Promise.resolve(window.confirm(question));

  return new Promise<boolean>((resolve) => tg.showConfirm(question, resolve));
}

function tellAdmin(message: string) {
  const tg = getTelegramWebApp();
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}

/** The evenings a debtor still owes for, the way the list says them: "27.09, 29.09". */
function describeGames(games: DebtGame[]) {
  return games.map((game) => formatGameDay(game.gameStartedAt)).join(", ");
}

/** The players who owe the club, the evenings they owe for, and the money they bring. */
export default function TMADebtsPage() {
  const { initData } = useTMA();
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>("players");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tma/debts", { headers: { "X-Telegram-Init-Data": initData } });
      if (!res.ok) throw new Error(String(res.status));

      const data = await res.json();
      setDebtors(data.debtors ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const selected = debtors.find((debtor) => debtor.debtorKey === selectedKey) ?? null;

  const open = (debtor: Debtor) => {
    setSelectedKey(debtor.debtorKey);
    setAmount(debtor.owed > 0 ? String(debtor.owed) : "");
  };

  const send = async (method: "DELETE" | "POST", url: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        body: body ? JSON.stringify(body) : undefined,
        headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": initData },
        method,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        getTelegramWebApp()?.HapticFeedback.notificationOccurred("error");
        tellAdmin(data.error ?? "Не получилось. Попробуйте ещё раз.");
        return null;
      }

      getTelegramWebApp()?.HapticFeedback.notificationOccurred("success");
      await load();
      return data as { owed: number };
    } catch {
      tellAdmin("Нет связи с сервером. Попробуйте ещё раз.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const takePayment = async (debtor: Debtor) => {
    const sum = Number(amount);
    if (!Number.isInteger(sum) || sum <= 0) {
      tellAdmin("Впишите сумму в рублях");
      return;
    }
    if (sum > debtor.owed) {
      tellAdmin(`Сумма больше долга: игрок должен ${formatRubles(debtor.owed)}`);
      return;
    }

    const answer = await send("POST", "/api/tma/debts", {
      amount: sum,
      debtorKey: debtor.debtorKey,
      kind: "payment",
    });
    if (answer) setAmount(answer.owed > 0 ? String(answer.owed) : "");
  };

  const writeOff = async (debtor: Debtor) => {
    const confirmed = await askToConfirm(
      `Списать ${formatRubles(debtor.owed)} у «${debtor.playerName}»? Клуб больше не ждёт эти деньги.`,
    );
    if (!confirmed) return;

    const answer = await send("POST", "/api/tma/debts", {
      debtorKey: debtor.debtorKey,
      kind: "writeoff",
    });
    if (answer) setAmount("");
  };

  const cancelPayment = async (debtor: Debtor, payment: DebtPaymentEntry) => {
    const what = payment.kind === "writeoff" ? "списание" : "оплату";
    const confirmed = await askToConfirm(
      `Отменить ${what} ${formatRubles(payment.amount)} у «${debtor.playerName}»? Долг вернётся.`,
    );
    if (!confirmed) return;

    const answer = await send("DELETE", `/api/tma/debts?payment=${encodeURIComponent(payment.id)}`);
    if (answer) setAmount(answer.owed > 0 ? String(answer.owed) : "");
  };

  if (selected) {
    return (
      <div className="tma-screen">
        <ScreenHeader
          back={{ disabled: busy, label: "Долги", onClick: () => setSelectedKey(null) }}
          title="Долг игрока"
        />

        <div className="tma-card">
          <span className="text-[20px] font-bold">{selected.playerName}</span>
          <span className="tma-row__badges">
            {!selected.accountId ? <span className="tma-badge">гость без аккаунта</span> : null}
            {selected.allowedUntil ? (
              <span className="tma-badge tma-badge--gold">
                запись разрешена до {formatGameDay(selected.allowedUntil)}
              </span>
            ) : null}
          </span>
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">{selected.owed > 0 ? "Должен" : "Долг закрыт"}</span>
            <span
              className={`tma-num text-[28px] font-bold ${
                selected.owed > 0 ? "text-[var(--tma-danger-text)]" : "text-[var(--tma-green)]"
              }`}
            >
              {formatRubles(selected.owed)}
            </span>
          </div>
        </div>

        {selected.games.length > 0 ? (
          <>
            <SectionLabel title="За какие игры" />
            <div className="tma-card tma-card--flush">
              {selected.games.map((game) => (
                <div key={game.id} className="tma-row">
                  <span className="tma-row__body">
                    <span className="tma-row__title">{formatGameDay(game.gameStartedAt)}</span>
                    <span className="tma-row__sub">
                      {game.left < game.amount
                        ? `осталось ${formatRubles(game.left)} из ${formatRubles(game.amount)}`
                        : `счёт ${formatRubles(game.amount)}`}
                      {game.source === "import" ? " · из таблицы" : ""}
                    </span>
                  </span>
                  <span className="tma-num shrink-0 font-bold">{formatRubles(game.left)}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {selected.owed > 0 ? (
          <div className="tma-card">
            {/* The whole debt is filled in: most players settle it at once, and the one who
                brings part of it changes the number. */}
            <label className="tma-field">
              <span className="tma-field__label">Сколько принесли, ₽</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 7))}
              />
            </label>
            <button
              className="tma-btn tma-btn--primary tma-btn--big"
              disabled={busy || !amount}
              type="button"
              onClick={() => void takePayment(selected)}
            >
              <Wallet size={18} /> Внести оплату
            </button>
            <p className="tma-hint">
              Деньги закрывают игры по порядку, начиная с самой старой.
            </p>
            <button
              className="tma-btn tma-btn--danger-soft"
              disabled={busy}
              type="button"
              onClick={() => void writeOff(selected)}
            >
              Списать долг
            </button>
          </div>
        ) : null}

        {selected.payments.length > 0 ? (
          <>
            <SectionLabel title="Оплаты" />
            <div className="tma-card tma-card--flush">
              {selected.payments.map((payment) => (
                <div key={payment.id} className="tma-row">
                  <span className="tma-row__body">
                    <span
                      className={`tma-row__title ${payment.cancelledAt ? "line-through opacity-60" : ""}`}
                    >
                      {payment.kind === "writeoff" ? "Списано" : "Оплата"} {formatRubles(payment.amount)}
                    </span>
                    <span className="tma-row__sub">
                      {formatGameDay(payment.createdAt)} в {formatEventTimeLabel(payment.createdAt)}
                      {payment.recordedBy ? ` · ${payment.recordedBy}` : ""}
                      {payment.cancelledAt ? " · отменена" : ""}
                    </span>
                  </span>
                  {!payment.cancelledAt ? (
                    <button
                      className="tma-btn tma-btn--auto tma-btn--danger-text !min-h-9 !bg-transparent !px-2 !text-sm"
                      disabled={busy}
                      type="button"
                      onClick={() => void cancelPayment(selected, payment)}
                    >
                      Отменить
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    );
  }

  const owing = debtors.filter((debtor) => debtor.owed > 0);
  const closed = debtors.filter((debtor) => debtor.owed <= 0);
  const total = owing.reduce((sum, debtor) => sum + debtor.owed, 0);

  // The evenings someone still owes for, newest first; an evening paid in full drops off.
  const games = new Map<string, Array<{ debtor: Debtor; game: DebtGame }>>();
  for (const debtor of owing) {
    for (const game of debtor.games) {
      games.set(game.gameStartedAt, [...(games.get(game.gameStartedAt) ?? []), { debtor, game }]);
    }
  }
  const evenings = [...games].sort(([a], [b]) => b.localeCompare(a));

  const debtorRow = (debtor: Debtor) => (
    <button key={debtor.debtorKey} className="tma-row" type="button" onClick={() => open(debtor)}>
      <span className="tma-row__body">
        <span className="tma-row__title">{debtor.playerName}</span>
        <span className="tma-row__sub">
          {debtor.owed > 0 ? `за ${describeGames(debtor.games)}` : "долг закрыт"}
        </span>
        {debtor.allowedUntil || !debtor.accountId || debtor.games.some((game) => game.source === "import") ? (
          <span className="tma-row__badges">
            {debtor.allowedUntil ? (
              <span className="tma-badge tma-badge--gold">можно до {formatGameDay(debtor.allowedUntil)}</span>
            ) : null}
            {!debtor.accountId ? <span className="tma-badge">гость</span> : null}
            {debtor.games.some((game) => game.source === "import") ? (
              <span className="tma-badge">из таблицы</span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span
        className={`tma-num shrink-0 font-bold ${debtor.owed > 0 ? "" : "text-[var(--tma-green)]"}`}
      >
        {formatRubles(debtor.owed)}
      </span>
      <ChevronRight className="shrink-0 text-[var(--tma-hint)]" size={18} />
    </button>
  );

  return (
    <div className="tma-screen">
      <ScreenHeader title="Касса" />
      <CashTabs current="debts" />

      {loading ? <p className="tma-empty">Загружаем долги…</p> : null}
      {!loading && failed ? (
        <p className="tma-empty">Не удалось загрузить долги. Откройте вкладку ещё раз.</p>
      ) : null}

      {!loading && !failed ? (
        <>
          <div className="tma-card">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">
                {owing.length > 0 ? `Должны ${owing.length}` : "Долгов нет"}
              </span>
              <span className="tma-num text-[24px] font-bold">{formatRubles(total)}</span>
            </div>
          </div>

          {owing.length > 0 ? (
            <div className="tma-segment">
              <button aria-pressed={view === "players"} type="button" onClick={() => setView("players")}>
                По игрокам
              </button>
              <button aria-pressed={view === "games"} type="button" onClick={() => setView("games")}>
                По играм
              </button>
            </div>
          ) : null}

          {view === "players" && owing.length > 0 ? (
            <div className="tma-card tma-card--flush">{owing.map(debtorRow)}</div>
          ) : null}

          {view === "games"
            ? evenings.map(([gameStartedAt, rows]) => (
                <section key={gameStartedAt} className="flex flex-col gap-2">
                  <SectionLabel
                    meta={formatRubles(rows.reduce((sum, row) => sum + row.game.left, 0))}
                    title={`${formatGameDay(gameStartedAt)} · не оплатили ${rows.length}`}
                  />
                  <div className="tma-card tma-card--flush">
                    {rows.map(({ debtor, game }) => (
                      <button
                        key={game.id}
                        className="tma-row"
                        type="button"
                        onClick={() => open(debtor)}
                      >
                        <span className="tma-row__body">
                          <span className="tma-row__title">{debtor.playerName}</span>
                          <span className="tma-row__sub">
                            {game.left < game.amount
                              ? `частично, счёт ${formatRubles(game.amount)}`
                              : "не оплачено"}
                            {debtor.games.length > 1 ? ` · всего должен ${formatRubles(debtor.owed)}` : ""}
                          </span>
                        </span>
                        <span className="tma-num shrink-0 font-bold">{formatRubles(game.left)}</span>
                        <ChevronRight className="shrink-0 text-[var(--tma-hint)]" size={18} />
                      </button>
                    ))}
                  </div>
                </section>
              ))
            : null}

          {closed.length > 0 ? (
            <>
              <SectionLabel title="Закрыли долг за неделю" />
              <div className="tma-card tma-card--flush">{closed.map(debtorRow)}</div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
