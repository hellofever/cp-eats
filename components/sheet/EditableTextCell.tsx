"use client";

import { useState } from "react";

// Click-to-edit text cell shared by Name/Phone/Notes/Address. Paste is handled one
// level up by the wrapping <td> (see app/sheet/page.tsx) so it works the same way
// whether or not this cell happens to be in edit mode.
export function EditableTextCell({
  value,
  onCommit,
  placeholder = "—",
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
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
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className="block w-full truncate px-3 py-2 text-left"
    >
      {value || <span className="text-black/30 dark:text-white/30">{placeholder}</span>}
    </button>
  );
}
