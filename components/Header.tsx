"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gear, List as ListIcon, Plus } from "@phosphor-icons/react";
import { BottomSheet } from "./BottomSheet";
import { ThemeToggle } from "./ThemeToggle";
import { DataSyncSettings } from "./DataSyncSettings";
import { MapSearchExpand } from "./MapSearchExpand";

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
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSearch(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function tabHref(href: string) {
    return q ? `${href}?q=${encodeURIComponent(q)}` : href;
  }

  return (
    <header className="sticky top-0 z-20 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-black/80">
      {/* Mobile */}
      <div className="flex items-center gap-3 md:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-black/60 dark:border-white/10 dark:text-white/60"
        >
          <ListIcon size={18} />
        </button>
        <div className="flex flex-1 justify-center">
          {pathname === "/" ? (
            <MapSearchExpand />
          ) : (
            <input
              type="search"
              value={q}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search restaurants…"
              className="w-full max-w-xs rounded-full border border-black/10 bg-black/[.03] px-4 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-white/[.06] dark:focus:border-white/30"
            />
          )}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:flex md:flex-wrap md:items-center md:gap-3">
        <div className="flex items-center gap-4">
          <span className="text-lg font-semibold tracking-tight">CP Places</span>
          <nav className="flex items-center gap-1 text-sm">
            {TABS.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tabHref(tab.href)}
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
          {pathname === "/" ? (
            <MapSearchExpand />
          ) : (
            <input
              type="search"
              value={q}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search restaurants…"
              className="w-full max-w-xs rounded-full border border-black/10 bg-black/[.03] px-4 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:bg-white/[.06] dark:focus:border-white/30"
            />
          )}
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
      </div>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)}>
        <h2 className="text-lg font-semibold">CP Places</h2>
        <nav className="mt-4 flex flex-col gap-1 text-sm">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tabHref(tab.href)}
                onClick={() => setMenuOpen(false)}
                className={`rounded-md px-3 py-2.5 transition-colors ${
                  active
                    ? "bg-black/[.04] text-black dark:bg-white/[.08] dark:text-white"
                    : "text-black/60 hover:bg-black/[.03] dark:text-white/60 dark:hover:bg-white/[.05]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-2 flex flex-col gap-1 border-t border-black/10 pt-2 text-sm dark:border-white/10">
          <button
            onClick={() => {
              setMenuOpen(false);
              onAdd();
            }}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-black/60 hover:bg-black/[.03] dark:text-white/60 dark:hover:bg-white/[.05]"
          >
            <Plus weight="bold" size={16} />
            Add Place
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              setSettingsOpen(true);
            }}
            className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-black/60 hover:bg-black/[.03] dark:text-white/60 dark:hover:bg-white/[.05]"
          >
            <Gear size={16} />
            Settings
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="mt-4 flex flex-col gap-4">
          <ThemeToggle />
          <DataSyncSettings />
        </div>
      </BottomSheet>
    </header>
  );
}
