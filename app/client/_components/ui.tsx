import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md ${className}`}
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
      className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-3.5 text-base font-semibold text-[#1a1206] shadow-[0_6px_20px_rgba(251,191,36,0.35)] transition active:scale-[0.98] disabled:opacity-50 ${className}`}
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : null}
      {children}
    </button>
  );
}

export function ScreenMessage({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] text-amber-300">
        {icon}
      </div>
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mx-auto max-w-xs text-sm text-white/55">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-amber-200/70">
      <Loader2 className="animate-spin" size={28} />
    </div>
  );
}
