import clsx from "clsx";
import type { BlindLevel } from "@/lib/timer/types";

type BlindsTableProps = {
  activePlayers: number;
  currentLevelIndex: number;
  eliminatedPlayers: number;
  levels: BlindLevel[];
};

export function BlindsTable({
  activePlayers,
  currentLevelIndex,
  eliminatedPlayers,
  levels,
}: BlindsTableProps) {
  // Показываем колонку анте только если хотя бы у одного не-перерыв уровня анте > 0
  const hasAnte = levels.some((l) => !l.isBreak && (l.ante ?? 0) > 0);

  return (
    <aside className={clsx("public-blinds-panel", !hasAnte && "public-blinds-panel--no-ante")}>
      <h2>Блайнды</h2>
      <div className="public-level-stats">
        <span>🎯 <strong>{activePlayers}</strong></span>
        <span>💀 <strong>{eliminatedPlayers}</strong></span>
      </div>
      <div className={clsx("public-level-grid", "public-level-header", !hasAnte && "public-level-grid--no-ante")}>
        <span>№</span>
        <span>МБ</span>
        <span>ББ</span>
        {hasAnte && <span>A</span>}
      </div>
      <div className="public-level-list">
        {levels.map((level, index) => (
          <div
            className={clsx(
              "public-level-grid",
              !hasAnte && "public-level-grid--no-ante",
              index === currentLevelIndex && "blind-row-active",
              level.isBreak && "blind-row-break",
            )}
            key={level.id}
          >
            <span>{level.levelOrder}</span>
            {level.isBreak ? (
              <span className="break-label">
                Ⅱ{Math.round((level.breakDurationSeconds ?? level.durationSeconds) / 60)}м
              </span>
            ) : (
              <>
                <span>{level.smallBlind}</span>
                <span>{level.bigBlind}</span>
                {hasAnte && <span>{level.ante || "-"}</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
