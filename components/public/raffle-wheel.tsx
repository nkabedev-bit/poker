"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Raffle } from "@/lib/raffle/raffle";

/**
 * The draw, over the whole screen.
 *
 * The winner was decided on the server; the wheel is an animation that lands on it, so
 * the room sees one result and it cannot be argued with. The pointer sits at the top,
 * and the wheel turns until the winning slice is under it.
 */
export function RaffleWheel({ logoUrl, raffle }: { logoUrl: string | null; raffle: Raffle }) {
  const [settled, setSettled] = useState(false);
  const [angle, setAngle] = useState(0);
  const spunFor = useRef<string | null>(null);

  const slices = raffle.numbers.length;
  const step = slices > 0 ? 360 / slices : 360;
  const winnerIndex = Math.max(0, raffle.numbers.indexOf(raffle.winnerNumber));

  useEffect(() => {
    if (spunFor.current === raffle.id) return;
    spunFor.current = raffle.id;
    setSettled(false);
    setAngle(0);

    // A frame at rest first, so the browser animates from zero rather than jumping.
    const start = window.setTimeout(() => {
      setAngle(360 * 8 + (360 - (winnerIndex + 0.5) * step));
    }, 60);
    const stop = window.setTimeout(() => setSettled(true), raffle.spinSeconds * 1000 + 200);

    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [raffle.id, raffle.spinSeconds, step, winnerIndex]);

  const wedges = useMemo(
    () =>
      raffle.numbers.map((number, index) => {
        const from = ((index * step - 90) * Math.PI) / 180;
        const to = (((index + 1) * step - 90) * Math.PI) / 180;
        const isVip = number >= 21;
        const mid = (index + 0.5) * step - 90;

        return {
          fill: isVip
            ? index % 2
              ? "#3a2a12"
              : "#4a3618"
            : index % 2
              ? "#241017"
              : "#3d1322",
          label: String(number),
          labelColor: isVip ? "#e9c07a" : "#ffffff",
          mid,
          number,
          path: `M200,200 L${200 + 196 * Math.cos(from)},${200 + 196 * Math.sin(from)} A196,196 0 0,1 ${
            200 + 196 * Math.cos(to)
          },${200 + 196 * Math.sin(to)} Z`,
          x: 200 + 152 * Math.cos((mid * Math.PI) / 180),
          y: 200 + 152 * Math.sin((mid * Math.PI) / 180),
        };
      }),
    [raffle.numbers, step],
  );

  // Numbers shrink as the wheel fills up; below this many they can stay large.
  const labelSize = slices <= 12 ? 34 : slices <= 20 ? 28 : 24;

  return (
    <div className="raffle-overlay">
      <div className="raffle-stage">
        <p className="raffle-title">
          {raffle.kind === "vip" ? "VIP розыгрыш" : "Розыгрыш бесплатной проходки"}
        </p>

        <div className="raffle-wheel-wrap">
          <span className="raffle-pointer" />
          <svg
            className="raffle-wheel"
            style={{
              transform: `rotate(${angle}deg)`,
              transitionDuration: `${raffle.spinSeconds}s`,
            }}
            viewBox="0 0 400 400"
          >
            {wedges.map((wedge) => (
              <g key={wedge.number}>
                <path d={wedge.path} fill={wedge.fill} stroke="rgba(0,0,0,0.45)" strokeWidth={1} />
                <text
                  dominantBaseline="central"
                  fill={wedge.labelColor}
                  fontSize={labelSize}
                  fontWeight={800}
                  textAnchor="middle"
                  transform={`rotate(${wedge.mid + 90},${wedge.x},${wedge.y})`}
                  x={wedge.x}
                  y={wedge.y}
                >
                  {wedge.label}
                </text>
              </g>
            ))}
          </svg>

          <div className="raffle-hub">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" src={logoUrl} />
            ) : (
              <span>MAJESTIC</span>
            )}
          </div>
        </div>

        <div className={settled ? "raffle-result raffle-result--shown" : "raffle-result"}>
          <p className="raffle-result__label">Победил номер</p>
          <p className="raffle-result__number">{raffle.winnerNumber}</p>
          <p className="raffle-result__name">{raffle.winnerName}</p>
          <p className="raffle-result__prize">
            {raffle.kind === "vip"
              ? "Приз от партнёров клуба"
              : "Бесплатная проходка на следующую игру"}
          </p>
        </div>
      </div>
    </div>
  );
}
