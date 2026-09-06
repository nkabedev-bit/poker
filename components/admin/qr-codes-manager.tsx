"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Download, History, Printer, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { forgetCardBatch, rememberCardBatch } from "@/app/admin/qr-codes/actions";
import {
  buildCardCodes,
  CARD_BATCH_MAX,
  nextStartNumber,
  type CardBatch,
} from "@/lib/cards/card-batch";
import { CARD_CODE_PREFIX } from "@/lib/cards/card-code";

type Card = { code: string; svg: string };

// Vector, so the print shop can blow a card up to any size without softening the code.
async function renderCard(code: string): Promise<Card> {
  const svg = await QRCode.toString(code, {
    color: { dark: "#000000", light: "#ffffff" },
    errorCorrectionLevel: "M",
    margin: 1,
    type: "svg",
    width: 320,
  });

  return { code, svg };
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/** "MJ-001 — MJ-100", the run an admin recognises without opening it. */
function describeBatch(batch: CardBatch) {
  const codes = buildCardCodes({
    count: batch.count,
    prefix: batch.prefix,
    start: batch.startNumber,
  });

  return codes.length === 1 ? codes[0] : `${codes[0]} — ${codes[codes.length - 1]}`;
}

function formatPrintedAt(iso: string) {
  const printed = new Date(iso);
  if (Number.isNaN(printed.getTime())) return "";

  return printed.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function QrCodesManager({ batches }: { batches: CardBatch[] }) {
  const router = useRouter();
  const lastBatch = batches[0] ?? null;
  const [prefix, setPrefix] = useState(lastBatch?.prefix ?? CARD_CODE_PREFIX);
  const [start, setStart] = useState(String(nextStartNumber(batches, lastBatch?.prefix ?? CARD_CODE_PREFIX)));
  const [count, setCount] = useState("10");
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const showBatch = useCallback(async (batch: CardBatch) => {
    const codes = buildCardCodes({
      count: batch.count,
      prefix: batch.prefix,
      start: batch.startNumber,
    });

    setCards(await Promise.all(codes.map(renderCard)));
  }, []);

  // The run the club printed last is what the page opens on: an admin coming back for
  // the sheet finds it already there instead of generating it a second time.
  const openedLastBatch = useRef(false);
  useEffect(() => {
    if (openedLastBatch.current || !lastBatch) return;

    openedLastBatch.current = true;
    void showBatch(lastBatch);
  }, [lastBatch, showBatch]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const startNumber = Math.max(1, Number(start) || 1);
      const codes = buildCardCodes({ count: Number(count), prefix, start: startNumber });

      // Written down before it is shown: a run that reaches the printer without reaching
      // the history is how two cards end up carrying the same number.
      await rememberCardBatch({ count: codes.length, prefix, startNumber });
      setCards(await Promise.all(codes.map(renderCard)));
      setStart(String(startNumber + codes.length));
      router.refresh();
    } catch {
      setError("Тираж не записался в историю — проверьте связь и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [count, prefix, router, start]);

  /** Reopens a printed run: the same codes, without writing the run down twice. */
  const reopen = useCallback(
    async (batch: CardBatch) => {
      setBusy(true);
      try {
        setPrefix(batch.prefix);
        setStart(String(batch.startNumber));
        setCount(String(batch.count));
        await showBatch(batch);
      } finally {
        setBusy(false);
      }
    },
    [showBatch],
  );

  async function forget(batch: CardBatch) {
    if (
      !window.confirm(
        `Убрать тираж ${describeBatch(batch)} из истории? Номера снова станут свободными — удаляйте только то, что не ушло в печать.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      await forgetCardBatch(batch.id);
      router.refresh();
    } catch {
      setError("Тираж не убрался из истории — проверьте связь и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  function downloadSheet() {
    const cardsHtml = cards
      .map(
        (card) => `<figure class="card">${card.svg}<figcaption>${card.code}</figcaption></figure>`,
      )
      .join("");

    downloadFile(
      `cards-${cards[0]?.code ?? "batch"}.html`,
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Карты клуба</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; }
  .card { margin: 0; padding: 4mm; border: 0.3mm dashed #bbb; border-radius: 3mm; text-align: center; break-inside: avoid; }
  .card svg { width: 100%; height: auto; }
  figcaption { margin-top: 2mm; font-size: 11pt; font-weight: 700; letter-spacing: 0.08em; }
</style></head><body><div class="sheet">${cardsHtml}</div></body></html>`,
      "text/html",
    );
  }

  function downloadOne(card: Card) {
    downloadFile(`${card.code}.svg`, card.svg, "image/svg+xml");
  }

  return (
    <div className="settings-stack">
      <section className="poker-panel">
        <div className="panel-heading">
          <div>
            <h2>QR коды для карт</h2>
            <p className="muted">
              Коды для клубных карт: печатаете их, выдаёте на входе, сканируете в админ-боте.
            </p>
          </div>
        </div>

        <div className="qr-form-row">
          <label>
            Префикс
            <input
              maxLength={12}
              value={prefix}
              onChange={(event) => {
                const next = event.target.value;
                setPrefix(next);
                // Each pack keeps its own numbering, so the field follows the pack.
                setStart(String(nextStartNumber(batches, next)));
              }}
            />
            <span className="field-help">MJ — клубные, G — гостевые.</span>
          </label>
          <label>
            Начать с номера
            <input
              inputMode="numeric"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
            <span className="field-help">Следующий свободный номер этой пачки.</span>
          </label>
          <label>
            Сколько карт
            <input
              inputMode="numeric"
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
            <span className="field-help">До {CARD_BATCH_MAX} за раз.</span>
          </label>
        </div>

        <div className="qr-actions">
          <button className="gold-button" disabled={busy} type="button" onClick={() => void generate()}>
            <RefreshCw size={16} /> {busy ? "Готовим..." : "Сгенерировать"}
          </button>
          <button
            className="ghost-button"
            disabled={cards.length === 0}
            type="button"
            onClick={downloadSheet}
          >
            <Download size={16} /> Скачать лист для печати
          </button>
          <button
            className="ghost-button"
            disabled={cards.length === 0}
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={16} /> Печать
          </button>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="poker-panel qr-history-panel">
        <div className="panel-heading">
          <div>
            <h2>Напечатанные тиражи</h2>
            <p className="muted">
              Каждая генерация записывается сюда — отсюда и берётся следующий свободный номер.
            </p>
          </div>
        </div>

        {batches.length === 0 ? (
          <p className="muted">
            <History size={16} /> Пока ни одного тиража — первый запишется сам.
          </p>
        ) : (
          <ul className="qr-history">
            {batches.map((batch) => (
              <li key={batch.id}>
                <button
                  className="qr-history-open"
                  disabled={busy}
                  type="button"
                  onClick={() => void reopen(batch)}
                >
                  <strong>{describeBatch(batch)}</strong>
                  <span className="muted">
                    {batch.count} шт · {formatPrintedAt(batch.createdAt)}
                  </span>
                </button>
                <button
                  aria-label={`Убрать тираж ${describeBatch(batch)}`}
                  className="ghost-button qr-history-forget"
                  disabled={busy}
                  type="button"
                  onClick={() => void forget(batch)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="poker-panel qr-sheet-panel">
        <div className="panel-heading qr-sheet-heading">
          <div>
            <h2>Карты ({cards.length})</h2>
            <p className="muted">Нажмите на карту, чтобы скачать её отдельным SVG.</p>
          </div>
        </div>

        {cards.length === 0 ? (
          <p className="muted">
            <QrCode size={16} /> Пока пусто — задайте префикс и нажмите «Сгенерировать».
          </p>
        ) : (
          <div className="qr-sheet">
            {cards.map((card) => (
              <button
                key={card.code}
                className="qr-card"
                title={`Скачать ${card.code}.svg`}
                type="button"
                onClick={() => downloadOne(card)}
              >
                <span className="qr-card-image" dangerouslySetInnerHTML={{ __html: card.svg }} />
                <span className="qr-card-code">{card.code}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
