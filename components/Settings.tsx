"use client";

import { useState } from "react";
import { CaretLeft, Gear, Tag } from "@phosphor-icons/react";
import { ThemeToggle } from "./ThemeToggle";
import { DataSyncSettings } from "./DataSyncSettings";
import { TagManager } from "./TagManager";

type Category = "general" | "tags";

const CATEGORIES: { id: Category; label: string; icon: typeof Gear }[] = [
  { id: "general", label: "General", icon: Gear },
  { id: "tags", label: "Tag Manager", icon: Tag },
];

// 2-column settings shell: a left category rail + right content pane on desktop.
// On mobile there isn't room for both side by side, so it's master-detail instead --
// the category list fills the sheet until one is tapped, then that category's content
// takes over with a back button; `drilledIn` only matters below the md breakpoint.
export function Settings() {
  const [category, setCategory] = useState<Category>("general");
  const [drilledIn, setDrilledIn] = useState(false);

  function selectCategory(id: Category) {
    setCategory(id);
    setDrilledIn(true);
  }

  return (
    <div className="flex gap-6 md:h-full">
      <div
        className={`${drilledIn ? "hidden md:block" : "block"} w-full shrink-0 md:h-full md:w-40 md:overflow-y-auto`}
      >
        <h2 className="px-1 pb-3 text-lg font-semibold md:hidden">Settings</h2>
        <nav className="flex flex-col gap-0.5">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectCategory(id)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-black/[.04] text-black dark:bg-white/[.08] dark:text-white"
                    : "text-black/60 hover:bg-black/[.02] dark:text-white/60 dark:hover:bg-white/[.04]"
                }`}
              >
                <Icon size={16} weight={active ? "fill" : "regular"} />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        className={`${drilledIn ? "block" : "hidden md:block"} min-w-0 flex-1 md:h-full md:overflow-y-auto`}
      >
        <button
          type="button"
          onClick={() => setDrilledIn(false)}
          className="mb-3 flex items-center gap-1 text-sm text-black/60 md:hidden dark:text-white/60"
        >
          <CaretLeft size={14} weight="bold" />
          Settings
        </button>

        {category === "general" && (
          <div className="flex flex-col gap-4">
            <ThemeToggle />
            <DataSyncSettings />
          </div>
        )}
        {category === "tags" && <TagManager />}
      </div>
    </div>
  );
}
