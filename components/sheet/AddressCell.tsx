"use client";

import { useState } from "react";
import { Warning } from "@phosphor-icons/react";

export function AddressCell({
  value,
  needsReview,
  onCommit,
  onClickReview,
}: {
  value: string;
  needsReview: boolean;
  onCommit: (next: string) => void;
  onClickReview: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit(finalValue: string) {
    setEditing(false);
    if (finalValue !== value) onCommit(finalValue);
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
            setDraft(value);
            setEditing(false);
          }
        }}
        className="w-full min-w-[8ch] border border-black/20 bg-white px-2 py-1 text-sm outline-none dark:border-white/20 dark:bg-black"
      />
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="min-w-0 flex-1 truncate text-left"
      >
        {value}
      </button>
      {needsReview && (
        <button
          type="button"
          onClick={onClickReview}
          title="Couldn't verify this location from the address -- click to fix"
          className="flex-none text-amber-500"
        >
          <Warning size={16} weight="fill" />
        </button>
      )}
    </div>
  );
}
