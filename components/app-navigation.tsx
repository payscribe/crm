"use client";

import type { NavigationItem } from "@/lib/constants/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";

type AppNavigationProps = {
  items: NavigationItem[];
  variant: "sidebar" | "mobile";
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavigation({ items, variant }: AppNavigationProps) {
  const pathname = usePathname();

  if (variant === "mobile") {
    return (
      <nav className="flex gap-2 overflow-x-auto border-t border-neutral-100 pt-3 lg:hidden">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded border px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-payscribe-blue bg-blue-50 text-payscribe-blue"
                  : "border-neutral-200 bg-white text-neutral-700"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 space-y-1">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`block rounded px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-blue-50 text-payscribe-blue"
                : "text-neutral-700 hover:bg-blue-50 hover:text-payscribe-blue"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
