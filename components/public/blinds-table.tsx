import clsx from "clsx";
import type { BlindLevel } from "@/lib/timer/types";

type BlindsTableProps = {
  currentLevelIndex: number;
  levels: BlindLevel[];
};

export function BlindsTable({ currentLevelIndex, levels }: BlindsTableProps) {
  return (
    <aside className="public-blinds-panel">
      <h2>Блайнды</h2>
      <div className="public-level-grid public-level-header">
        <span>№</span>
        <span>МБ</span>
        <span>ББ</span>
        <span>A</span>
      </div>
      <div className="public-level-list">
        {levels.map((level, index) => (
          <div
            className={clsx(
              "public-level-grid",
              index === currentLevelIndex && "blind-row-active",
              level.isBreak && "blind-row-break",
            )}
            key={level.id}
          >
            <span>{level.levelOrder}</span>
            {level.isBreak ? (
              <span className="break-label">Перерыв</span>
            ) : (
              <>
                <span>{level.smallBlind}</span>
                <span>{level.bigBlind}</span>
                <span>{level.ante ?? "-"}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
