"use client";

import { useCallback, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, QrCode, RefreshCw } from "lucide-react";
import { buildCardCodes, CARD_BATCH_MAX } from "@/lib/cards/card-batch";

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

export function QrCodesManager() {
  const [prefix, setPrefix] = useState("MJ");
  const [start, setStart] = useState("1");
  const [count, setCount] = useState("10");
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(false);

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      const codes = buildCardCodes({
        count: Number(count),
        prefix,
        start: Number(start),
      });

      setCards(await Promise.all(codes.map(renderCard)));
    } finally {
      setBusy(false);
    }
  }, [count, prefix, start]);

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
              onChange={(event) => setPrefix(event.target.value)}
            />
          </label>
          <label>
            Начать с номера
            <input
              inputMode="numeric"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
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
