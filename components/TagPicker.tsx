"use client";

import { useEffect, useState } from "react";
import { createTag, fetchTags, type Tag, type TagKind } from "@/lib/tags";

// Shared multi/single-select for tags, areas, and city -- all three are user-creatable,
// freeform lists stored the same way (see lib/tags.ts). `multiple` just controls whether
// picking a new option replaces the current selection or adds to it; nothing at the data
// layer enforces single-select for city, it's purely a UI choice.
export function TagPicker({
  kind,
  label,
  multiple,
  selectedIds,
  onChange,
  initialQuery,
}: {
  kind: TagKind;
  label: string;
  multiple: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  initialQuery?: string;
}) {
  const [options, setOptions] = useState<Tag[]>([]);
  const [input, setInput] = useState(initialQuery ?? "");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTags(kind).then(setOptions).catch(console.error);
  }, [kind]);

  const selected = options.filter((o) => selectedIds.includes(o.id));
  const query = input.trim().toLowerCase();
  const matches = query
    ? options.filter((o) => !selectedIds.includes(o.id) && o.name.toLowerCase().includes(query))
    : [];
  const exactMatch = options.some((o) => o.name.toLowerCase() === query);

  function toggle(id: string) {
    if (multiple) {
      onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    } else {
      onChange(selectedIds.includes(id) ? [] : [id]);
    }
    setInput("");
  }

  async function handleCreate() {
    if (!input.trim()) return;
    setCreating(true);
    try {
      const tag = await createTag(kind, input.trim());
      setOptions((o) => [...o, tag]);
      onChange(multiple ? [...selectedIds, tag.id] : [tag.id]);
      setInput("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span>{label}</span>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              style={{ borderColor: t.color ?? "var(--color-black, #262b22)", color: t.color ?? undefined }}
            >
              {t.name} ✕
            </button>
          ))}
        </div>
      )}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={`Add ${label.toLowerCase()}…`}
        className="rounded-lg border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-white/5"
      />
      {input && (
        <div className="flex flex-col gap-1 rounded-lg border border-black/10 p-1.5 dark:border-white/10">
          {matches.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              className="rounded px-2 py-1.5 text-left hover:bg-black/[.03] dark:hover:bg-white/5"
            >
              {t.name}
            </button>
          ))}
          {!exactMatch && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded px-2 py-1.5 text-left text-[#bd5a1f] hover:bg-black/[.03] dark:hover:bg-white/5"
            >
              {creating ? "Creating…" : `+ Create "${input.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
