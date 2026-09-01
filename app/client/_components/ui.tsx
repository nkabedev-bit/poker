import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-md ${className}`}
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
      className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#b8163c] to-[#7d0d26] px-4 py-3.5 text-base font-semibold text-white shadow-[0_6px_20px_rgba(184,22,60,0.35)] transition active:scale-[0.98] disabled:opacity-50 ${className}`}
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
      className={`flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white/80 transition active:scale-[0.98] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#b8163c] px-2.5 py-1 text-[11px] font-semibold text-white">
      {children}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur">
      {children}
    </span>
  );
}

export function SectionHeader({ href, title }: { href?: string; title: string }) {
  const content = (
    <>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {href ? <ChevronRight className="text-white/40" size={18} /> : null}
    </>
  );

  return href ? (
    <Link className="flex items-center gap-1 px-1" href={href}>
      {content}
    </Link>
  ) : (
    <div className="flex items-center gap-1 px-1">{content}</div>
  );
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
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] text-[#e0416a]">
        {icon}
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mx-auto max-w-xs text-sm text-white/55">{subtitle}</p> : null}
      </div>
      {action ? <div className="w-full max-w-xs">{action}</div> : null}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-white/50">
      <Loader2 className="animate-spin" size={28} />
    </div>
  );
}
