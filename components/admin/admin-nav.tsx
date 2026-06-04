"use client";

import clsx from "clsx";
import { Settings, Timer, Tv, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/settings", label: "Настройки", icon: Settings },
  { href: "/admin/blinds", label: "Блайнды", icon: Workflow },
  { href: "/admin/timer", label: "Таймер", icon: Timer },
  { href: "/screen", label: "Экран", icon: Tv },
];

export function AdminNav({ publicToken }: { publicToken: string }) {
  const pathname = usePathname();

  return (
    <nav className="admin-tabs">
      {items.map((item) => {
        const href = item.href === "/screen" ? `/screen/${publicToken}` : item.href;
        const active = pathname === item.href;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            className={clsx("admin-tab", active && "admin-tab-active")}
            href={href}
            target={item.href === "/screen" ? "_blank" : undefined}
          >
            <Icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
