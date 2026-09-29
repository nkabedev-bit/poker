import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Loader2 } from "lucide-react";

/** Panel used for every block that is not a poster: soft, dark, barely lit. */
export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[22px] border border-white/[0.07] bg-white/[0.045] p-5 shadow-[0_10px_34px_rgba(0,0,0,0.5)] ${className}`}
    >
      {children}
    </div>
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
      className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#c8163f] to-[#7d0d26] px-4 py-4 text-[15px] font-bold tracking-wide text-white shadow-[0_10px_28px_rgba(200,22,63,0.35)] transition active:scale-[0.985] disabled:opacity-45 disabled:shadow-none ${className}`}
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : null}
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-white/75 transition active:scale-[0.985] disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

/** The red plate a poster carries: "Новый формат!", "Глубокие стеки!". */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-xl bg-gradient-to-r from-[#c8163f] to-[#8d0f2b] px-3 py-1.5 text-[12px] font-bold text-white shadow-[0_6px_18px_rgba(200,22,63,0.35)]">
      {children}
    </span>
  );
}

/** Date, time and seat pills that sit on top of a poster. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-md">
      {children}
    </span>
  );
}

export function SectionHeader({ href, title }: { href?: string; title: string }) {
  const content = (
    <>
      <h2 className="text-[19px] font-bold tracking-tight text-white">{title}</h2>
      {href ? <ChevronRight className="text-white/35" size={19} /> : null}
    </>
  );

  return href ? (
    <Link className="flex items-center gap-1" href={href}>
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-1">{content}</div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-[28px] font-bold tracking-tight">{children}</h1>;
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
        className={`flex h-[72px] w-[72px] items-center justify-center rounded-[24px] border border-white/[0.07] bg-white/[0.04] text-[#e0416a] ${
          lively ? "client-float client-glint relative overflow-hidden" : ""
        }`}
      >
        {icon}
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold">{title}</h2>
        {subtitle ? <p className="mx-auto max-w-xs text-sm text-white/50">{subtitle}</p> : null}
      </div>
      {action ? <div className="w-full max-w-xs pt-2">{action}</div> : null}
    </div>
  );
}

/** Shown wherever the upcoming-games list is empty: the schedule is simply not out yet. */
export function NoEventsCard() {
  return (
    <GlassCard className="py-8 text-center">
      <CalendarDays className="mx-auto mb-3 text-white/25" size={30} />
      <p className="text-[17px] font-bold">Опубликуем расписание в понедельник в 19:00</p>
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
