"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Navigation items. Add a new entry here to add a new tab.
// `match` is used to decide which tab is highlighted.
const NAV_ITEMS = [
  { href: "/", label: "Home", emoji: "🏠", match: (p: string) => p === "/" },
  {
    href: "/martial-arts",
    label: "Martial Arts",
    emoji: "🥋",
    match: (p: string) => p.startsWith("/martial-arts"),
  },
  {
    href: "/lift",
    label: "Lift",
    emoji: "🏋️",
    match: (p: string) => p.startsWith("/lift"),
  },
] as const;

export default function BottomNav() {
  // Next.js hook that gives us the current URL path.
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md">
      <div className="max-w-md mx-auto grid grid-cols-3">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
                active
                  ? "text-green-600 dark:text-green-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              <span className="text-2xl">{item.emoji}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
