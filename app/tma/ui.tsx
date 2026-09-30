"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * The top of a screen. A tab's own screen has its name large on the left; a screen
 * opened from another has the way back on the left and its name in the middle.
 */
export function ScreenHeader({
  actions,
  back,
  title,
}: {
  actions?: ReactNode;
  // The label is short, where the way back goes; `ariaLabel` spells it out when a
  // screen reader (or a test) needs more than the destination.
  back?: { ariaLabel?: string; disabled?: boolean; href?: string; label: string; onClick?: () => void };
  title: ReactNode;
}) {
  if (!back) {
    return (
      <div className="tma-header">
        <h1 className="tma-header__title">{title}</h1>
        {actions ? <div className="tma-header__side tma-header__side--end">{actions}</div> : null}
      </div>
    );
  }

  const backContent = (
    <>
      <ChevronLeft size={20} /> {back.label}
    </>
  );

  return (
    <div className="tma-header tma-header--nested">
      <div className="tma-header__side">
        {back.href ? (
          <Link aria-label={back.ariaLabel} className="tma-back" href={back.href}>
            {backContent}
          </Link>
        ) : (
          <button
            aria-label={back.ariaLabel}
            className="tma-back"
            disabled={back.disabled}
            type="button"
            onClick={back.onClick}
          >
            {backContent}
          </button>
        )}
      </div>
      <h1 className="tma-header__title">{title}</h1>
      <div className="tma-header__side tma-header__side--end">{actions}</div>
    </div>
  );
}

export function SectionLabel({ meta, title }: { meta?: ReactNode; title: ReactNode }) {
  return (
    <div className="tma-section-label">
      <span className="tma-section-label__title">{title}</span>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}

/**
 * The pills a list is narrowed down by: every table, one table, or whatever else the
 * screen offers. An empty value means "all".
 */
export function TableChips({
  extra = [],
  onChange,
  tables,
  value,
}: {
  extra?: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  tables: number[];
  value: string;
}) {
  // A single table leaves nothing to narrow down to, unless the screen adds a filter.
  if (tables.length < 2 && extra.length === 0) return null;

  const options = [
    { label: "Все", value: "" },
    ...(tables.length > 1 ? tables.map((table) => ({ label: `Стол ${table}`, value: String(table) })) : []),
    ...extra,
  ];

  return (
    <div aria-label="Фильтр по столу" className="tma-chips" role="group">
      {options.map((option) => (
        <button
          key={option.value || "all"}
          aria-pressed={value === option.value}
          className="tma-chip"
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** An on/off row that reads like an iOS switch, around a real checkbox. */
export function ToggleRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="tma-toggle">
      <input
        checked={checked}
        className="sr-only"
        type="checkbox"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="tma-toggle__text">{label}</span>
      <span aria-hidden="true" className={`tma-toggle-switch${checked ? " tma-toggle-switch--on" : ""}`}>
        <span className="tma-toggle-switch__knob" />
      </span>
    </label>
  );
}
