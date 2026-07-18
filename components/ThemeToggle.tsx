"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Desktop, Moon, Sun } from "@phosphor-icons/react";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Desktop },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-black/50 dark:text-white/50">Appearance</span>
      <div className="flex w-fit gap-1.5">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
                active
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-black/15 text-black/70 dark:border-white/15 dark:text-white/70"
              }`}
            >
              <Icon size={14} weight={active ? "fill" : "regular"} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
