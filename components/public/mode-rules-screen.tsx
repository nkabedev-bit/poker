"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Database, Gift, Star, Ticket, type LucideIcon } from "lucide-react";
import { MODE_RULES_FONT_CLASSES } from "@/components/public/mode-rules-fonts";
import type { ModeRules, ModeRulesFeature, MysteryPrizeIcon } from "@/lib/timer/mode-rules";

/** The slide is laid out on the club deck's own canvas and scaled to whatever screen it is on. */
const STAGE_WIDTH = 2000;
const STAGE_HEIGHT = 1125;
/** How wide the tournament's name may run before it is set smaller: up to the art. */
const TITLE_MAX_WIDTH = 820;
const TITLE_MAX_FONT_SIZE = 150;

const MYSTERY_PRIZE_ICONS: Record<MysteryPrizeIcon, LucideIcon> = {
  gift: Gift,
  stack: Database,
  star: Star,
  ticket: Ticket,
};

type ModeRulesScreenProps = {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  rules: ModeRules;
};

/**
 * The rules of tonight's game across the whole board, while the room is being seated.
 *
 * Drawn after the club's deck on its own 16:9 canvas, scaled to fit the screen: a TV
 * that is not quite 16:9 gets dark margins rather than a slide pulled out of shape.
 */
export function ModeRulesScreen({ isFullscreen, onToggleFullscreen, rules }: ModeRulesScreenProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scale = useStageScale(rootRef);

  return (
    <div
      aria-label={`Правила турнира ${rules.title}`}
      className={`mode-rules mode-rules--${rules.accent} ${MODE_RULES_FONT_CLASSES}`}
      ref={rootRef}
      role="region"
    >
      <div
        className="mode-rules__stage"
        style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <section className="mode-rules__main">
          <header className="mode-rules__header">
            <span className="mode-rules__brand">MAJESTIC</span>
            <span aria-hidden className="mode-rules__header-divider" />
            <span className="mode-rules__eyebrow">Правила турнира · перед стартом</span>
            <span className="mode-rules__tag">{rules.tag}</span>
          </header>

          <div className="mode-rules__intro">
            <div className="mode-rules__kicker">{rules.kicker}</div>
            <ModeRulesTitle title={rules.title} />
            <div className="mode-rules__description">{rules.description}</div>
            {rules.feature ? <ModeRulesFeatureBlock feature={rules.feature} /> : null}
          </div>

          <div className="mode-rules__stats">
            {rules.stats.map((stat) => (
              <div className="mode-rules__stat" key={stat.label}>
                <div className="mode-rules__stat-label">{stat.label}</div>
                <div
                  className={
                    stat.accent ? "mode-rules__stat-value mode-rules__stat-value--accent" : "mode-rules__stat-value"
                  }
                >
                  {stat.value}
                </div>
                <div className="mode-rules__stat-note">{stat.note}</div>
              </div>
            ))}
          </div>

          <footer className="mode-rules__footer">
            Играем без денежных ставок · фишки не имеют денежного эквивалента
          </footer>
        </section>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="mode-rules__art" src={rules.artSrc} />

        {rules.placePoints.length > 0 ? (
          <aside className="mode-rules__itp">
            <div className="mode-rules__itp-title">ITP</div>
            <div className="mode-rules__itp-subtitle">Очки за место</div>
            <ol className="mode-rules__itp-rows">
              {rules.placePoints.map(({ place, points }) => (
                <li
                  className={place <= 3 ? "mode-rules__itp-row mode-rules__itp-row--top" : "mode-rules__itp-row"}
                  key={place}
                >
                  <span className="mode-rules__itp-place">{place}</span>
                  <span className="mode-rules__itp-points">{points.toLocaleString("ru-RU")}</span>
                </li>
              ))}
            </ol>
            <div className="mode-rules__itp-note">{rules.placePointsNote}</div>
          </aside>
        ) : null}
      </div>

      <button
        aria-label={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
        className="public-icon-button mode-rules__fullscreen"
        type="button"
        onClick={onToggleFullscreen}
      >
        {isFullscreen ? "⊞" : "⛶"}
      </button>
    </div>
  );
}

/** The canvas's scale on this screen: as large as it goes without being cut off. */
function useStageScale(rootRef: RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function fit() {
      if (!root || !root.clientWidth || !root.clientHeight) return;
      setScale(Math.min(root.clientWidth / STAGE_WIDTH, root.clientHeight / STAGE_HEIGHT));
    }

    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(root);
    window.addEventListener("resize", fit);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [rootRef]);

  return scale;
}

/**
 * The tournament's name, as large as the deck sets it, made smaller only when a long one
 * would run into the art. Measured again once the display face has loaded, since the
 * fallback face is narrower.
 */
function ModeRulesTitle({ title }: { title: string }) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    let cancelled = false;

    function fitTitle() {
      if (!element || cancelled) return;
      element.style.fontSize = `${TITLE_MAX_FONT_SIZE}px`;
      const naturalWidth = element.scrollWidth;
      if (!naturalWidth || naturalWidth <= TITLE_MAX_WIDTH) return;

      element.style.fontSize = `${Math.floor((TITLE_MAX_FONT_SIZE * TITLE_MAX_WIDTH) / naturalWidth)}px`;
    }

    fitTitle();
    document.fonts?.ready.then(fitTitle).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [title]);

  return (
    <h2 className="mode-rules__title" ref={titleRef}>
      {title}
    </h2>
  );
}

function ModeRulesFeatureBlock({ feature }: { feature: ModeRulesFeature }) {
  if (feature.kind === "bounty") {
    return (
      <div className="mode-rules__bounty">
        <div className="mode-rules__bounty-part">
          <strong className="mode-rules__big-number">+{feature.points.toLocaleString("ru-RU")}</strong>
          <span className="mode-rules__caps">Рейтинга</span>
        </div>
        <div className="mode-rules__bounty-part mode-rules__bounty-part--chips">
          <strong className="mode-rules__big-number mode-rules__accent">+{feature.bigBlinds} BB</strong>
          <span className="mode-rules__caps">Фишки в стек</span>
        </div>
      </div>
    );
  }

  if (feature.kind === "progressive") {
    const topPoints = Math.max(...feature.ladder.map((step) => step.points));
    const lastIndex = feature.ladder.length - 1;

    return (
      <div className="mode-rules__progressive">
        <ol className="mode-rules__ladder">
          {feature.ladder.map((step, index) => (
            <li
              className="mode-rules__ladder-step"
              key={step.label}
              style={{
                ["--bar-height" as string]: `${Math.round((step.points / topPoints) * 120)}px`,
                // From a dim red at the start to the full colour on the last head.
                ["--bar-opacity" as string]: String(0.3 + (0.7 * index) / Math.max(1, lastIndex)),
              }}
            >
              <strong className={index === lastIndex ? "mode-rules__accent" : undefined}>
                {step.points.toLocaleString("ru-RU")}
              </strong>
              <span aria-hidden className="mode-rules__ladder-bar" />
              <span className="mode-rules__ladder-label">{step.label}</span>
            </li>
          ))}
        </ol>
        <div className="mode-rules__progressive-lines">
          <div>
            Старт: <b>{feature.basePoints} PTS + {feature.bigBlinds} BB</b>
          </div>
          <div>
            <b>+{feature.stepPoints} PTS</b> к голове за каждый нокаут
          </div>
          <div>После ре-энтри — снова {feature.basePoints}</div>
        </div>
      </div>
    );
  }

  if (feature.kind === "mystery") {
    const lastIndex = feature.prizes.length - 1;

    return (
      <div className="mode-rules__mystery">
        <div className="mode-rules__section-label">Внутри может быть</div>
        <div className="mode-rules__prizes">
          {feature.prizes.map((prize, index) => {
            const Icon = MYSTERY_PRIZE_ICONS[prize.icon];

            return (
              <div
                className={index === lastIndex ? "mode-rules__prize mode-rules__prize--special" : "mode-rules__prize"}
                key={prize.title}
              >
                <span className="mode-rules__prize-icon">
                  <Icon aria-hidden size={24} strokeWidth={2} />
                </span>
                <span className="mode-rules__prize-title">{prize.title}</span>
                <span className="mode-rules__prize-note">{prize.note}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (feature.kind === "freeroll") {
    return (
      <div className="mode-rules__headline">
        <strong className="mode-rules__huge-number">FREE</strong>
        <span className="mode-rules__headline-side mode-rules__accent">
          Первый вход
          <br />
          бесплатно
        </span>
      </div>
    );
  }

  return (
    <div className="mode-rules__headline">
      <strong className="mode-rules__huge-number mode-rules__accent">+{feature.bonusPercent}%</strong>
      <span className="mode-rules__headline-side">
        К каждому ITP
        <br />
        <span className="mode-rules__muted">уже в таблице справа</span>
      </span>
    </div>
  );
}
