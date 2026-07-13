"use client";

import { useState } from "react";
import { formatPriceLevel, parsePriceLevel } from "@/lib/sheetSort";

// Text input (not a <select>) so this can also serve as a paste anchor -- a <select>
// can't receive a pasted clipboard string the way a real text input can.
export function PriceCell({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (next: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatPriceLevel(value));

  function commit(finalValue: string) {
    setEditing(false);
    const parsed = parsePriceLevel(finalValue);
    if (parsed !== value) onCommit(parsed);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Escape") {
            setDraft(formatPriceLevel(value));
            setEditing(false);
          }
        }}
        placeholder="$, $$, $$$…"
        className="w-full min-w-[6ch] border border-black/20 bg-white px-2 py-1 text-sm outline-none dark:border-white/20 dark:bg-black"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(formatPriceLevel(value));
        setEditing(true);
      }}
      className="block w-full px-3 py-2 text-left"
    >
      {value ? formatPriceLevel(value) : <span className="text-black/30 dark:text-white/30">—</span>}
    </button>
  );
}
