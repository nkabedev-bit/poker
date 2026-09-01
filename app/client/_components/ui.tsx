import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";

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
  title,
  subtitle,
}: {
  action?: ReactNode;
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[24px] border border-white/[0.07] bg-white/[0.04] text-[#e0416a]">
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

export function LoadingScreen() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-white/40">
      <Loader2 className="animate-spin" size={28} />
    </div>
  );
}
