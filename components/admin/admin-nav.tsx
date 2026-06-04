"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

const items = [
  { href: "/admin/settings", label: "⚙️ Настройки" },
  { href: "/admin/players", label: "👥 Игроки (0)" },
  { href: "/admin/tables", label: "🎲 Столы (0)" },
  { href: "/admin/timer", label: "⏱️ Таймер" },
  { href: "/admin/pts", label: "🏆 PTS Рейтинг" },
  { href: "/admin/leaderboard", label: "📊 Лидерборд" },
];

export function AdminNav({ publicToken }: { publicToken: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const prefetchRoute = useCallback(
    (href: string) => {
      if (href !== pathname) {
        router.prefetch(href);
      }
    },
    [pathname, router],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      items.forEach((item) => prefetchRoute(item.href));
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [prefetchRoute]);

  return (
    <nav className="admin-tabs">
      {items.map((item) => {
        const active = pathname === item.href;
        const href = item.href;

        return (
          <Link
            key={item.href}
            className={clsx("admin-tab", active && "admin-tab-active")}
            href={href}
            onFocus={() => prefetchRoute(href)}
            onMouseEnter={() => prefetchRoute(href)}
          >
            {item.label}
          </Link>
        );
      })}
      <Link className="admin-tab admin-screen-tab" href={`/screen/${publicToken}`} target="_blank">
        📺 Экран
      </Link>
    </nav>
  );
}
