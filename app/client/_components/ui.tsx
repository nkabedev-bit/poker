import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";

/** Panel used for every block that is not a poster: a flat, warm-dark surface. */
export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[20px] border border-club-line bg-club-surface p-4 ${className}`}>
      {children}
    </div>
  );
}

const PRIMARY_BUTTON =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-club-crimson px-5 text-[15px] font-extrabold text-white shadow-[0_10px_24px_rgba(200,33,63,0.35)] transition active:scale-[0.985]";

/** A link that looks like the main button: "Записаться" on a card that opens a screen. */
export function PrimaryLink({
  children,
  className = "",
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <Link className={`${PRIMARY_BUTTON} ${className}`} href={href}>
      {children}
    </Link>
  );
}

export function PrimaryButton({
  children,
  className = "",
  loading = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`${PRIMARY_BUTTON} disabled:opacity-45 disabled:shadow-none ${className}`}
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : null}
      {children}
    </button>
  );
}

const GHOST_BUTTON =
  "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-club-line bg-white/[0.06] px-5 text-[15px] font-extrabold text-club-text transition active:scale-[0.985]";

/** A quiet link shaped like a button: "К расписанию турниров". */
export function GhostLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className={GHOST_BUTTON} href={href}>
      {children}
    </Link>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`${GHOST_BUTTON} disabled:opacity-45 ${className}`}>
      {children}
    </button>
  );
}

/** The red plate a poster carries: "Новый формат!", "Глубокие стеки!". */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full bg-club-crimson px-3 text-[12px] font-bold text-white">
      {children}
    </span>
  );
}

/** Date, time and seat pills that sit on top of a poster. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/55 px-2.5 text-[12px] font-semibold text-club-text backdrop-blur-md">
      {children}
    </span>
  );
}

export type PillTone = "neutral" | "gold" | "goldOutline" | "mint" | "rose" | "muted";

const PILL_TONES: Record<PillTone, string> = {
  gold: "border-transparent bg-club-gold/10 text-club-gold",
  goldOutline: "border-club-gold/50 bg-transparent text-club-gold",
  mint: "border-club-mint/35 bg-club-mint/12 text-club-mint",
  muted: "border-club-line bg-transparent text-club-muted",
  neutral: "border-transparent bg-white/[0.06] text-club-muted",
  rose: "border-club-rose/45 bg-club-crimson/15 text-club-rose",
};

/** A small rounded label: a date, a status, a tier. */
export function Pill({
  children,
  className = "",
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: PillTone;
}) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] font-semibold ${PILL_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Small uppercase caption over a figure or a block: "В ИГРЕ", "СЛЕДУЮЩАЯ ИГРА". */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-bold uppercase tracking-[0.12em] text-club-faint ${className}`}>
      {children}
    </p>
  );
}

/** A thin bar that fills with a share: seats taken, a level run down, progress. */
export function ProgressBar({
  className = "",
  color = "bg-club-crimson",
  height = 4,
  value,
}: {
  className?: string;
  color?: string;
  height?: number;
  /** 0..1 */
  value: number;
}) {
  const share = Math.max(0, Math.min(1, value));

  return (
    <div className={`overflow-hidden rounded-full bg-white/[0.08] ${className}`} style={{ height }}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(share * 100)}%` }} />
    </div>
  );
}

/** One of the figures in a row of numbers: games, knockouts, top-9. */
export function StatCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 py-3.5">
      <span className="font-display text-[24px] font-semibold tabular-nums">{value}</span>
      <span className="text-[12px] text-club-muted">{label}</span>
    </div>
  );
}

/** Three figures in one panel, split by hairlines. */
export function StatStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-club-line rounded-[20px] border border-club-line bg-club-surface">
      {children}
    </div>
  );
}

/** The tinted square an icon sits in at the start of a menu row. */
export function IconTile({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-club-raised text-club-gold ${className}`}
    >
      {children}
    </span>
  );
}

/** A row of a grouped menu: icon, title, a line under it, a value and a chevron. */
export function MenuRow({
  children,
  href,
  icon,
  subtitle,
  title,
  value,
}: {
  /** Anything that goes under the subtitle, such as a progress bar. */
  children?: ReactNode;
  href: string;
  icon: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
  value?: ReactNode;
}) {
  return (
    <Link className="flex min-h-[68px] items-center gap-3.5 px-3.5 py-3 transition active:bg-white/[0.03]" href={href}>
      <IconTile>{icon}</IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[15px] font-bold">{title}</p>
        {subtitle ? <p className="text-[12px] text-club-muted">{subtitle}</p> : null}
        {children}
      </div>
      {value != null ? (
        <span className="whitespace-nowrap font-display text-[14px] font-semibold text-club-muted">{value}</span>
      ) : null}
      <ChevronRight className="shrink-0 text-club-faint" size={18} />
    </Link>
  );
}

/** A panel holding menu rows, with hairlines between them. */
export function MenuGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-club-line bg-club-surface [&>*+*]:border-t [&>*+*]:border-club-line">
      {children}
    </div>
  );
}

export function SectionHeader({
  href,
  linkLabel = "Все",
  title,
}: {
  href?: string;
  linkLabel?: string;
  title: string;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      {href ? (
        <Link className="inline-flex h-11 items-center gap-0.5 text-[13px] font-semibold text-club-muted" href={href}>
          {linkLabel}
          <ChevronRight size={16} />
        </Link>
      ) : null}
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] md:text-[34px]">{children}</h1>;
}

/**
 * A screen's title with the line under it that says what the screen is for. On a wide
 * screen the controls of the screen stand at the right end of the heading; on a phone
 * they follow it.
 */
export function PageHeading({
  actions,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
}) {
  const heading = (
    <div className="flex flex-col gap-1.5 md:gap-2">
      <PageTitle>{title}</PageTitle>
      {subtitle ? <p className="text-[14px] text-club-muted md:text-[15px]">{subtitle}</p> : null}
    </div>
  );

  if (!actions) return heading;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
      {heading}
      <div className="flex shrink-0 items-center gap-2.5">{actions}</div>
    </div>
  );
}

/** A segmented switch: "Актуальные / Прошедшие", "По рейтингу / По нокаутам". */
export function Segmented<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
}) {
  return (
    <div className="flex gap-1 rounded-2xl border border-club-line bg-club-surface p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            aria-pressed={active}
            className={`h-10 flex-1 rounded-xl text-[14px] font-bold transition-colors ${
              active ? "bg-club-crimson text-white" : "text-club-muted"
            }`}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ScreenMessage({
  action,
  icon,
  lively = false,
  title,
  subtitle,
}: {
  action?: ReactNode;
  icon: ReactNode;
  /** For something on its way rather than missing: the icon hovers and catches the light. */
  lively?: boolean;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div
        className={`flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border border-club-line bg-club-surface text-club-rose ${
          lively ? "client-float client-glint relative overflow-hidden" : ""
        }`}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[20px] font-semibold">{title}</h2>
        {subtitle ? <p className="mx-auto max-w-xs text-sm text-club-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="w-full max-w-xs pt-2">{action}</div> : null}
    </div>
  );
}

/** Shown wherever the upcoming-games list is empty: the schedule is simply not out yet. */
export function NoEventsCard() {
  return (
    <GlassCard className="flex flex-col items-center gap-3 py-8 text-center">
      <CalendarDays className="text-club-faint" size={30} />
      <p className="text-[16px] font-bold">Опубликуем расписание в понедельник в 19:00</p>
    </GlassCard>
  );
}

/** A grey block standing in for a piece of the screen that is on its way. */
function Bone({ className }: { className: string }) {
  return <span className={`client-skeleton block ${className}`} />;
}

function BoneRows({ className, count }: { className: string; count: number }) {
  return Array.from({ length: count }, (_, index) => <Bone key={index} className={className} />);
}

/** Which screen is loading, so the placeholders take the shape it is about to have. */
export type LoadingShape = "cards" | "event" | "grid" | "home" | "profile" | "rating" | "results" | "rows";

const SKELETONS: Record<LoadingShape, ReactNode> = {
  cards: <BoneRows className="h-[168px] rounded-[22px]" count={3} />,
  event: (
    <>
      <Bone className="h-[210px] rounded-[22px]" />
      <Bone className="h-5 w-2/5 rounded-md" />
      <Bone className="h-16 rounded-[22px]" />
      <div className="grid grid-cols-3 gap-2">
        <BoneRows className="h-[92px] rounded-[20px]" count={3} />
      </div>
      <Bone className="h-[52px] rounded-2xl" />
    </>
  ),
  grid: (
    <>
      <Bone className="h-[132px] rounded-[22px]" />
      <div className="grid grid-cols-2 gap-3">
        <BoneRows className="h-[164px] rounded-[22px]" count={4} />
      </div>
    </>
  ),
  home: (
    <>
      <div className="flex items-center gap-3">
        <Bone className="h-[52px] w-[52px] rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="h-4 w-1/2 rounded-md" />
          <Bone className="h-3 w-1/3 rounded-md" />
        </div>
      </div>
      <Bone className="h-[196px] rounded-[22px]" />
      <div className="flex flex-col gap-2">
        <Bone className="mb-1 h-5 w-2/5 rounded-md" />
        <BoneRows className="h-[58px] rounded-[18px]" count={3} />
      </div>
    </>
  ),
  profile: (
    <>
      <Bone className="h-8 w-1/3 rounded-lg" />
      <div className="flex items-center gap-4">
        <Bone className="h-[72px] w-[72px] rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Bone className="h-5 w-1/2 rounded-md" />
          <Bone className="h-3 w-1/3 rounded-md" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <BoneRows className="h-[104px] rounded-[22px]" count={3} />
      </div>
      <Bone className="h-[62px] rounded-[22px]" />
      <Bone className="h-[112px] rounded-[22px]" />
    </>
  ),
  rating: (
    <>
      <Bone className="h-8 w-2/5 rounded-lg" />
      <Bone className="h-[50px] rounded-2xl" />
      <div className="flex flex-col gap-2">
        <BoneRows className="h-[58px] rounded-[18px]" count={7} />
      </div>
    </>
  ),
  results: (
    <>
      <Bone className="h-8 w-3/4 rounded-lg" />
      <Bone className="h-[86px] rounded-[20px]" />
      <div className="grid grid-cols-3 items-end gap-2">
        <Bone className="h-[150px] rounded-t-2xl" />
        <Bone className="h-[190px] rounded-t-2xl" />
        <Bone className="h-[130px] rounded-t-2xl" />
      </div>
      <div className="flex flex-col gap-2">
        <BoneRows className="h-[58px] rounded-[18px]" count={3} />
      </div>
    </>
  ),
  rows: (
    <>
      <Bone className="h-[190px] rounded-[22px]" />
      <div className="flex flex-col gap-2">
        <BoneRows className="h-[58px] rounded-[18px]" count={5} />
      </div>
    </>
  ),
};

/**
 * What a screen shows while its data is on the way: placeholders in the shape of what is
 * coming. A spinner in an empty screen said nothing about what to expect, and the screen
 * then appeared all at once.
 */
export function LoadingScreen({ shape = "cards" }: { shape?: LoadingShape }) {
  return (
    <div aria-busy="true" aria-label="Загрузка" className="client-skeleton-screen flex flex-col gap-5 pt-1" role="status">
      {SKELETONS[shape]}
    </div>
  );
}
