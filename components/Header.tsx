"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gear, Plus } from "@phosphor-icons/react";
import { BottomSheet } from "./BottomSheet";

const TABS = [
  { href: "/", label: "Map" },
  { href: "/list", label: "List" },
  { href: "/sheet", label: "Sheet" },
];

export function Header({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const [settingsOpen, setSettingsOpen] = useState(false);

  function handleSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-black/80">
      <div className="flex items-center gap-4">
        <span className="text-lg font-semibold tracking-tight">CP Places</span>
        <nav className="flex items-center gap-1 text-sm">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={q ? `${tab.href}?q=${encodeURIComponent(q)}` : tab.href}
                className={`rounded-md px-2.5 py-1.5 transition-colors ${
                  active
                    ? "text-black dark:text-white"
                    : "text-black/50 hover:text-black/80 dark:text-white/50 dark:hover:text-white/80"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex flex-1 justify-center">
        <input
          type="search"
          value={q}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search restaurants…"
          className="w-full max-w-xs rounded-full border border-black/10 bg-black/[.03] px-4 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-white/[.06] dark:focus:border-white/30"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-[#bd5a1f] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus weight="bold" size={16} />
          Add Place
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
        >
          <Gear size={18} />
        </button>
      </div>

      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          Nothing here yet — settings are coming soon.
        </p>
      </BottomSheet>
    </header>
  );
}
